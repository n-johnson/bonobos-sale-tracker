/*
 * Bonobos.js - Bonobos API Class
 * Author: Nathan Johnson
 * Date: July 31, 2014
 * License: MIT License
 */

var request = require("request"),
    fs = require('fs');

var Bonobos = function() {
    this.baseURL = 'http://www.bonobos.com/b/';
    this.categoryList = ['mens-pants', //Couldn't find API endpoint with a category list so hardcoded list necessary
        'mens-suits',
        'dress-shirts-for-men',
        'casual-shirts-for-men',
        'mens-jeans',
        'mens-sweaters',
        'tees-knits-and-polos-for-men',
        'outerwear-for-men',
        'mens-shorts',
        'mens-swimwear',
        'accessories-for-men',
        'bags-for-men',
        'mens-shoes',
        'slim'
    ];
    this.saleList = 'sale-for-men';
    this.productArray = []; //All products
    this.saleArray = []; //Products listed in sales category
    /*    this.completeSalesList = []; //Actual list of all products on sale
    this.unlistedSales = []; //Only products which are on sale but are not listed in the sales category*/
    this.asyncCategoryCounter = 0;
    this.productFileName = 'data.json';
    this.salesFileName = 'sales.json';
};

/* req - Performs HTTP request to specified category JSON file
 * cat: (string) category name
 * isSalesCategory: (boolean) sales category is processed differently
 * cb: (function) callback no arguments
 */
Bonobos.prototype.req = function(cat, isSalesCategory, cb) {
    var self = this,
        url = this.baseURL + cat + '.json',
        parsedBody;

    console.log('Loading URL: ', url);

    return request(url, function(err, resp, body) {
        if (err)
            throw err;
        try {
            parsedBody = JSON.parse(body); //If body is not returned as expected
        } catch (e) {
            console.log('HTTP request did not return the expected JSON response in Bonobos.req()');
            throw e;
        }

        return self.parseProducts(parsedBody, cat, isSalesCategory, cb);
    });
};

/* parseProducts - Takes JSON data and pulls the products out of each category/subcategory
 * categoryJSON: (JSON Object) From Bonobos.req() HTTP request
 * cat: (string) which category was requested to link to each product
 * isSalesCategory: (boolean) Process sales category differently
 * cb: (function) callback
 */
Bonobos.prototype.parseProducts = function(categoryJSON, cat, isSalesCategory, cb) {
    cb = cb || function() {};
    var productList = isSalesCategory ? this.saleArray : this.productArray,
        categoryList = isSalesCategory ? [] : this.categoryList,
        writeToFile = isSalesCategory ? this.salesFileName : this.productFileName;

    for (var subcategoryIndex in categoryJSON.sub_categories) {
        var subCategory = categoryJSON.sub_categories[subcategoryIndex];
        for (var product in subCategory.products) {
            //Attach the primary and sub category to each item - otherwise no link and have to reparse data later
            subCategory.products[product].categoryLink = {
                'cat': cat,
                'sub_cat': {
                    id: subCategory.id,
                    name: subCategory.name
                }
            };
            productList.push(subCategory.products[product]);
        }
    }

    if (!isSalesCategory) {
        this.asyncCategoryCounter++; //Only write to file & return callback on final category
        console.log(this.asyncCategoryCounter, categoryList.length, cat);
    }

    //Sales only has one category - no need to wait for all async calls to complete. Otherwise, wait until our counter
    //reaches the total number of expected categories.
    if (isSalesCategory || this.asyncCategoryCounter == categoryList.length) {
        return fs.writeFile('./' + writeToFile, JSON.stringify(productList), function(err, res) {
            if (err)
                throw err;
            return cb();
        });
    }
};

/* loadAllDataFromBonobos - Loads all categories, including the sales category
 * cb: (function) callback
 */
Bonobos.prototype.loadAllDataFromBonobos = function(cb) {
    var self = this;
    this.loadSaleCategory(function() {
        return self.loadNormalCategories(cb);
    });
};

/* loadNormalCategories - Loads only the normal categories as defined in Bonobos.categoryList
 * cb: (function) callback
 */
Bonobos.prototype.loadNormalCategories = function(cb) {
    for (var i = 0; i < this.categoryList.length; i++) {
        this.req(this.categoryList[i], false, cb); //false -> isSalesCategory
    }
};

/* loadSaleCategory - Loads only the sales cateogry
 * cb: (function) callback
 */
Bonobos.prototype.loadSaleCategory = function(cb) {
    return this.req(this.saleList, true, cb); // true -> isSalesCategory
};

/* loadFromFile - Instead of loading the data from the website, we load it from a saved json file
 *              - Saves on HTTP requests, no need to overload the site unless we need fresh information
 * cb: (function) callback
 */
Bonobos.prototype.loadFromFile = function(cb) {
    cb = cb || function() {};
    var self = this;
    fs.readFile('./' + this.productFileName, function(err, data) {
        self.productArray = JSON.parse(data);
        console.log('Loaded: ' + self.productArray.length + ' products');

        fs.readFile('./' + self.salesFileName, function(err, data) {
            self.saleArray = JSON.parse(data);
            console.log('Loaded: ' + self.saleArray.length + ' sale products');
            return cb();
        });
    });
};

/* forceLoadUnlisted - called if API hasn't loaded and processed data yet.
 * cb: (function) callback
 */
Bonobos.prototype.forceLoadUnlisted = function(cb) {
    var self = this;
    if (this.unlistedSales && this.completeSalesList && this.productArray) { //We've already loaded - application error
        return cb(true, null);
    } else { //Not loaded yet, load data and send to callback
        this.loadFromFile(function() {
            return cb(null, self.findUnlistedSales());
        });
    }
};

/* findUnlistedSales - Processes the products to find items on sale.
 *              - Specifically both of those actually listed in the sale category, and those that are hidden
 */
Bonobos.prototype.findUnlistedSales = function() {
    this.completeSalesList = this._getItemsOnSale(this.productArray);

    this.unlistedSales = this._productListComparison(this.saleArray, this.completeSalesList);
    this.unlistedSales.sort(this._salesPercentSorter);

    return this.unlistedSales;
};

/* _getItemsOnSale - Searches the product list for items on sale - defined by (product.special_price !== 0)
 * productList: (array) - Product list to check for sale items
 * @return: Array of items on sale
 */
Bonobos.prototype._getItemsOnSale = function(productList) {
    var sales = [];
    for (var i = 0; i < productList.length; i++) {
        var item = productList[i];
        if (item.special_price !== 0) {
            item.salePercent = (item.price - item.special_price) / item.price || 0;
            sales.push(item);
        }
    }
    return sales;
};

/* _productListComparison - Takes two product lists and returns an array of what items
 * are not in the first list but are in the second list
 * @return (array) - Array of products
 */
Bonobos.prototype._productListComparison = function(saleCategoryProducts, actualSaleProducts) {
    var productListDifferences = [];
    var saleCategoryProductID = saleCategoryProducts.map(function(e) {
        return e.entity_id;
    });

    //Compare pID's between lists. Push list differences to array
    for (i = 0; i < actualSaleProducts.length; i++) {
        if (saleCategoryProductID.indexOf(actualSaleProducts[i].entity_id) === -1)
            productListDifferences.push(actualSaleProducts[i]);
    }

    return productListDifferences;
};

/* start - called on API server start to ensure at a minimum data has been received from bonobos.com
 *         and is written to the json files as expected
 */
Bonobos.prototype.start = function() {
    if (fs.existsSync('./' + this.productFileName) && fs.existsSync('./' + this.salesFileName)) {
        return true;
    }
    console.log('Initial loading: data files not found, running update on live data.');
    this.loadAllDataFromBonobos(function() {
        console.log('Data loaded from bonobos!');
    });
};

/* update - updates information from bonobos.com
 *        - The json parse/stringify object-deep copy may be "slow", however it is only called
 *        - once an hour, so the extra second it takes is not noticed and is easier than a true deep copy.
 */
Bonobos.prototype.update = function() {
    var self = this;

    var temp = new Bonobos(); //This allows us to load the new data without deleting current data from memory and waiting for the action to complete
    temp.loadAllDataFromBonobos(function() {
        console.log('Bonobos update complete!');
        temp.findUnlistedSales(); //Synchronous
        self.productArray = JSON.parse(JSON.stringify(temp.productArray));
        self.saleArray = JSON.parse(JSON.stringify(temp.saleArray));
        self.completeSalesList = JSON.parse(JSON.stringify(temp.completeSalesList));
        self.unlistedSales = JSON.parse(JSON.stringify(temp.unlistedSales));
    });
};

/* _salesPercentSorter - sorter function to sort by object.salePercent
 */
Bonobos.prototype._salesPercentSorter = function(a, b) {
    return a.salePercent - b.salePercent;
};

module.exports = function() {
    return new Bonobos();
};