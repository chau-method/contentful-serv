const express = require('express');
const contentful = require('contentful');
const api = require('./api');
var fs = require('fs')

const SPACE_ID = process.env.API_SPACE_ID || api.SPACE_ID;
const ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || api.ACCESS_TOKEN;

const client = contentful.createClient({
  space: SPACE_ID,
  accessToken: ACCESS_TOKEN,
});

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// saveData();

/**
 * Saves the category data
 *
*/
function saveData() {
  client.getEntries({
    content_type: 'wrapperForCategories',
    include: 6
  })
  .then((data) => {
    formatData(data, false, 'categories');
  })
  .catch((error) => { console.error(error); });
}

/**
 * Formats the data of the parent loop
 * @param  {Object} data          data object being returned from contentful
 * @param  {Object} res           response object from express
 * @param  {string} loopField     the key of the first value to enter in at
 */
function formatData(data, res, loopField) {
  const items = data.items[0].fields[loopField];
  const dataArray = [];
  let finalObj = {};

  items.map((item) => {
    const itemObj = Object.assign({}, item.fields);
    createNavObject(itemObj, item.fields);
    flattenImage(itemObj, 'backgroundImage');
    stripSystem(itemObj);

    if (itemObj.tiles) {
      const tileArray = [];

      item.fields.tiles.map((tile) => {
        const tileObj = Object.assign({}, tile.fields);
        tileObj.product = tileObj.product.fields;

        createNextViewObj(tileObj);
        flattenNestedProducts(tileObj);
        trimSpecialRequestsAndIngredients(tileObj.product);

        tileArray.push(tileObj);
      });
      itemObj.tiles = tileArray;
    }
    dataArray.push(itemObj);
  });

  finalObj = dataArray.reduce((obj, item) => {
    obj[item.id] = item;
    return obj;
  }, {});

  if (res) {
    res.json(finalObj);
  }

  // fs.writeFile('./data/categories.json', JSON.stringify(finalObj), 'utf-8', function(err) {
  //   if (err) throw err
  //   console.log('Categories: Saved!')
  // });
}

/**
 * Simpler strip data function, used for products
 * @param  {Object} data    data object from contentful
 * @param  {Object} res     response object from express

 */
function stripData(data, res) {
  const dataArray = [];
  data.items.map((item) => {
    dataArray.push(item.fields);
    trimSpecialRequestsAndIngredients(item.fields);

    if (item.fields.product) {
      const temp = item.fields.product.fields
      delete item.fields.product;
      item.fields.product = temp;

      if (item.fields.product.products) {
        const productArray = [];
        item.fields.product.products.map((product) => {
          productArray.push(product.fields);
        });

        delete item.fields.product.products;
        item.fields.product.products = productArray;
      }
    }

    if (item.fields.products) {
      const productArray = [];
      item.fields.products.map((product) => {
        productArray.push(product.fields);
      });

      delete item.fields.products;
      item.fields.products = productArray;
    }

    if (item.fields.configurable) {
      const tempHolder = createConfigurable(item.fields.configurable);
      delete item.fields.configurable;
      item.fields.configurable = tempHolder;
    }

    if (item.fields.criteriaSize) {
      const criteriaObj = {
        size: item.fields.criteriaSize,
        side: item.fields.criteriaSide
      }

      delete item.fields.criteriaSize;
      delete item.fields.criteriaSide;

      item.fields.criteria = criteriaObj
    }

    if (item.fields.itemAnchor) {
      const itemObj = {
        anchor: item.fields.itemAnchor,
        side: item.fields.itemSide,
        drink: item.fields.itemDrink,
        toy: item.fields.itemToy || false
      }

      delete item.fields.itemAnchor;
      delete item.fields.itemSide;
      delete item.fields.itemDrink;
      delete item.fields.itemToy;

      item.fields.items = itemObj;
    }

    Object.keys(item.fields).map((key) => {
      if(item.fields[key].fields) {
        Object.keys(item.fields[key].fields).map((innerKey) => {
          if (key === 'choiceLoop' && innerKey === 'label') {
            const labelObj = {}
            item.fields['choiceLoop'].fields['label'].map((label) => {
              delete label.fields.contentTitle;
              const tempLabel = label.fields;
              labelObj[`"${label.fields.id}"`] = tempLabel;
            });
            delete item.fields.choiceLoop.fields.label;
            item.fields.choiceLoop.fields.label = labelObj
          } else if (item.fields[key].fields[innerKey].fields) {
            const tempInner = item.fields[key].fields[innerKey].fields;
            delete item.fields[key].fields[innerKey];
            item.fields[key].fields[innerKey] = tempInner;
            delete item.fields[key].fields[innerKey].contentTitle;
          };
        });

        const temp = item.fields[key].fields;
        delete item.fields[key];
        item.fields[key] = temp;
      };
    });

    if (item.fields.reviewCardModify) {
      const tempObj = {};
      tempObj.modify = item.fields.reviewCardModify;
      tempObj.makeMeal = item.fields.reviewCardMakeMeal;
      delete item.fields.reviewCardModify;
      delete item.fields.reviewCardMakeMeal;
      item.fields.reviewCard = tempObj;
    }

    if (item.fields.paymentStaticImage) {
      item.fields.payment = {
        staticImage: item.fields.paymentStaticImage
      };
      delete item.fields.paymentStaticImage;
    }

    if (item.fields.pushoutStaticImage) {
      item.fields.pushOut = {
        staticImage: item.fields.pushoutStaticImage
      };
      delete item.fields.pushoutStaticImage;
    }

    if (item.fields.bogoExpiration) {
      item.fields.bogo = {
        expiration: item.fields.bogoExpiration
      }
      delete item.fields.bogoExpiration;
    }

    if (item.fields.categoryLanding && item.fields.categoryLanding.subcats) {
      const changeArray = ['coldDrinks', 'hotDrinks', 'bottledDrinks'];
      const changeTo = ['"Cold Drinks"', '"Hot Drinks"', '"Bottled Drinks"'];

      changeArray.map((key, index) => {
        const valueHolder = item.fields.categoryLanding.subcats[key];
        delete item.fields.categoryLanding.subcats[key];
        item.fields.categoryLanding.subcats[changeTo[index]] = valueHolder;
      });
    }

    if (item.fields.grillScreen) {
      const changeArray = ['cutInHalf', 'toastedBun'];
      const changeTo = ['"Cut In Half"', '"Toasted Bun"'];

      changeArray.map((key, index) => {
        const valueHolder = item.fields.grillScreen[key];
        delete item.fields.grillScreen[key];
        item.fields.grillScreen[changeTo[index]] = valueHolder;
      });
    }

    if (item.fields.general && item.fields.general.saladDressing) {
      item.fields.general['"Salad Dressing"'] = item.fields.general.saladDressing;
      delete item.fields.general.saladDressing;
    }
  });

  if (res) {
    res.json(dataArray)
  }

  // fs.writeFile('./data/data.json', JSON.stringify(dataArray), 'utf-8', function(err) {
  //   if (err) throw err
  //   console.log('Done!')
  // });
}

/**
 * Formats the configurable object
 * @param  {object} itemObj     Configurable Object coming in
 */
function createConfigurable(itemObj) {
  const configArray = [];
  itemObj.map((configWrapperItem) => {
    const configItemObj = {};

    configItemObj[configWrapperItem.fields.id] = [];
    configWrapperItem.fields.configurableItems.map((configItem) => {
      configItemObj[configWrapperItem.fields.id].push(configItem.fields);
    });
    configArray.push(configItemObj);
  });
  return configArray;
}

/**
 * Creates the Navigation Object from the CMS
 * @param  {Object} itemObj     The items.fields object that is being iterated over
 * @param  {Object} item        A copy of the items.fields object to reference
 */
function createNavObject(itemObj, item) {
  itemObj.navItem = {};
  itemObj.navItem.type = item.navItemType
  itemObj.navItem.title = item.navItemTitle
  itemObj.navItem.image = item.navImg

  delete itemObj.navItemType;
  delete itemObj.navItemTitle;
  delete itemObj.navImg;
}

/**
 * Flatten the image property returning from the CMS
 * @param  {object} object    The itemObject that stores the formatted data
 * @param  {string} key       The key to search for
 */
function flattenImage(object, key) {
  if (object[key] && object[key].fields.file) {
    object[key] = object[key].fields.file.url;
  };
}

/**
 * Creates the nextView object to match the json schema
 * @param  {object} tileObj   the card objects from the categories
 */
function createNextViewObj(tileObj) {
  tileObj.nextView = {};
  if (tileObj.currentCategory === 'none' || tileObj.currentView === 'none') {
    tileObj.nextView = 'none';
  }
  else if (tileObj.currentCategory && tileObj.currentView) {
    tileObj.nextView.currentCategory = tileObj.currentCategory
    tileObj.nextView.currentView = tileObj.currentView
    delete tileObj.currentCategory;
    delete tileObj.currentView;
  } else {
    delete tileObj.nextView;
  }
}

/**
 * Flattens products that are nested
 * @param  {object} tileObj   the card object from the categories
 */
function flattenNestedProducts(tileObj) {
  if (tileObj.product.products || tileObj.products) {
    const productArray = [];
    const productsCopy = tileObj.product.products.slice(0) || tileObj.products.slice(0);
    productsCopy.map((product) => {
      productArray.push(product.fields);
    });
    delete tileObj.product.products;
    tileObj.product.products = productArray;
  }
}

/**
 * Strips out the subcategories
 * @param  {object} obj   category object
 */
function stripSystem(obj) {
  if (obj.subcats) {
    const temp = obj.subcats.fields.subcats;
    delete obj.subcats;
    obj.subcats = temp;
  }
}

/**
 * Trims the special and requests
 * @param  {object} item   the item object product/tile
 */
function trimSpecialRequestsAndIngredients(item) {
  if (item.specialRequestHolder) {
    const temp = item.specialRequestHolder.fields.specialRequests;
    delete item.specialRequestHolder;
    item.specialRequests = temp;
  }

  if (item.ingredientHolder) {
    const ingredientArray = [];
    item.ingredientHolder.map((ingredient) => {
      if (ingredient.fields) {
        const temp = ingredient.fields;
        ingredientArray.push(temp);
      }
    });
    delete item.ingredientHolder;
    item.ingredients = ingredientArray;
  }
}

app.get('/api/categories', (req, res) => {
  client.getEntries({
    content_type: 'wrapperForCategories',
    include: 6
  })
  .then((data) => {
    formatData(data, res, 'categories');
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/cards', (req, res) => {
  client.getEntries({
    content_type: 'card',
    include: 6
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/deals', (req, res) => {
  client.getEntries({
    content_type: 'deal',
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/products', (req, res) => {
  client.getEntries({
    content_type: 'product',
    include: 6,
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/meals', (req, res) => {
  client.getEntries({
    content_type: 'meal',
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/promos', (req, res) => {
  client.getEntries({
    content_type: 'promo',
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/ingredients', (req, res) => {
  client.getEntries({
    content_type: 'ingredient',
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get(['/api/languages', '/api/:locale/languages'], (req, res) => {
  client.getEntries({
    content_type: 'language',
    include: 10,
    'fields.localeId': req.params.locale || 'us',
  }).then((data) => {
    stripData(data, res);
  })
  .catch((error) => {console.error(error); });
});

app.get(['/api/:locale/categories', '/api/:locale/categories/:lang'], (req, res) => {
  client.getEntries({
    content_type: 'wrapperForCategories',
    include: 6,
    locale: req.params.lang || '',
    'fields.localeId': req.params.locale,
  })
  .then((data) => {
    formatData(data, res, 'categories');
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/:lang/products', (req, res) => {
  client.getEntries({
    content_type: 'product',
    include: 6,
    locale: req.params.lang,
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/:lang/meals', (req, res) => {
  client.getEntries({
    content_type: 'meal',
    include: 2,
    locale: req.params.lang,
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});


app.get('/api/product/:id', (req, res) => {
  client.getEntries({
    content_type: 'product',
    'fields.id': req.params.id,
  })
  .then((data) => {
    res.json(data);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/product/type/:id', (req, res) => {
  client.getEntries({
    content_type: 'product',
    'fields.parentRef': req.params.id
  })
  .then((data) => {
    stripData(data, res);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/deal/:id', (req, res) => {
  client.getEntries({
    content_type: 'deal',
    'fields.id': req.params.id,
  })
  .then((data) => {
    res.json(data);
  })
  .catch((error) => { console.error(error); });
});

app.get('/api/promo/:id', (req, res) => {
  client.getEntries({
    content_type: 'promo',
    'fields.id': req.params.id,
  })
  .then((data) => {
    res.json(data);
  })
  .catch((error) => { console.error(error); });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Production Express Server on PORT: ${PORT}`);
});
