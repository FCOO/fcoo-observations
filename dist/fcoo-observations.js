/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
	"use strict";

    let ns = window.fcoo = window.fcoo || {},
       //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    nsObservations.observationPeriods = [6, 12, 24]; //= The different hour-periods to display previous observation stat (min, mean, max) over. Must have length = 3
    nsObservations.forecastPeriods    = [6, 12, 24]; //= The different hour-periods to display forecast stat (min, mean, max) over. Must have length = 3

    /*
    To display stat for previous X (=observationPeriods[i]) hours of observations or Y (=forecastPeriods[i]) hours of forecast
    a minimum percent of hourly values are required. This percent is given in observation/forecast_minimumPercentValues
    */
    nsObservations.observation_minimumPercentValues = 2/3;
    nsObservations.forecast_minimumPercentValues    = 1;    //All forecast needed!

    /***************************************************************
    fcooObservations = Current version of FCOOObservations
    nsObservations.getFCOOObservation(resolve) calls resolve with (ns.fcooObservations)
    nsObservations.fcooObservations is created first time
    ****************************************************************/
    nsObservations.fcooObservations = null;

    nsObservations.getFCOOObservations = function(resolve, whenFullLoaded, options){
        if (ns.fcooObservations && (!whenFullLoaded || ns.fcooObservations.fullLoaded)){
            resolve(ns.fcooObservations);
            return;
        }

        ns.fcooObservations = ns.fcooObservations || new ns.FCOOObservations(options);
        if (whenFullLoaded)
            ns.fcooObservations.resolveFullList.push(resolve);
        else
            ns.fcooObservations.resolveList.push(resolve);
    };


    /***************************************************************
    FCOOObservations
    ****************************************************************/
    ns.FCOOObservations = function(options = {}){
        this.options = $.extend(true, {}, {
			VERSION         : "5.0.3",
            subDir          : {
                observations: 'observations',
                forecasts   : 'forecasts'
            },
            groupFileName           : 'observations-groups.json',
            locationFileName        : 'locations.json',
        }, options);

        //resolveList, resolveFullList = []FUNCTION(fcooObservations: FCOOObservations)
        //List of functions to be called when fcooObservations is created (this.resolveList) or when full loaded (resolveFullList)
        this.resolveList = [];
        this.resolveFullList = [];

        this.init();

        this.ready = false;
        this.fullLoaded = false;

        //Read observations-groups
        this.observationGroupList = [];
        this.observationGroups = {};

        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.groupFileName}),
            resolve : function(data){
                let standard = data.standard || {};
                let forceGroupIds = this.options.forceGroupIds || '';
                data.groupList.forEach( options => {
                    if (forceGroupIds  ? forceGroupIds.includes(options.id) : !options.inactive){
                        let standardNameList = (options.standard || '').split(' '),
                            ogOpt = {index: this.observationGroupList.length};

                        standardNameList.forEach( standardName => {
                            if (standardName && standard[standardName])
                                ogOpt = $.extend(true, ogOpt, standard[standardName]);
                        });

                        ogOpt = $.extend(true, ogOpt, options);

                        const newObservationGroup = new nsObservations.ObservationGroup(ogOpt, this);
                        this.observationGroupList.push(newObservationGroup);
                        this.observationGroups[newObservationGroup.id] = newObservationGroup;
                    }
                }, this);
            }.bind(this)
        });


        //Read locations
        this.locations = {};
        this.locationList = [];
        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.locationFileName}),
            resolve : function(data){
                data.forEach( options => {
                    let location = new nsObservations.Location(options);
                    location.observations = this;
                    this.locationList.push(location);
                    this.locations[location.id] = location;
                }, this);
            }.bind(this),
        });

        //When the object is created and obs-groups and locations are loaded: Call all pending resolve-function (if any)
        ns.promiseList.append({
            data   : 'none',
            resolve: this._resolveList.bind(this, this.resolveList)

        });

        //Read setup for each observation-group
        ns.promiseList.append({
            data   : 'none',
            resolve: function(){

                this.observationGroupList.forEach( obsGroup => obsGroup._promise_setup() );

                ns.promiseList.append({
                    data   : 'none',
                    resolve: function(){
                        this.ready = true;

                        this.onResolve();

                        //When the object is fully loaded: Call all pending resolve-function (if any)
                        this._resolveList( this.resolveFullList );
                        this.fullLoaded = true;

                    }.bind(this)
                });
            }.bind(this)
        });
    };

    ns.FCOOObservations.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },
        onResolve: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        //_resolveList = Call all function in list with this
        _resolveList: function( list = [] ){
            list.forEach( resolve => resolve(this), this);
            return this;
        }
    };
}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
location.js

Location = group of Stations with the same or different paramtre

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    /*****************************************************
    Location
    Represent a location with one or more 'stations'
    *****************************************************/

    /*
    To allow different "systems" using the same FCOOObservations
    there are three global lists of "functions" under nsObservations that are being used:

    updateLastObservationFuncList
    updateObservationFuncList
    updateForecastFuncList

    The three list contains of
        1: Function, or
        2: {func: Function or String (method-name for context), context: Object (default = this (Location))}, or
        3: String (method-name for Location) => 2:
    */

    nsObservations.updateLastObservationFuncList  = [];
    nsObservations.updateObservationFuncList  = [];
    nsObservations.updateForecastFuncList  = [];

    nsObservations.imgWidth  = 500; //250; //600;
    nsObservations.imgHeight = 340; //Original = 400;

    nsObservations.Location = function( options ){
        this.options = options;
        this.id = options.id;
        this.name = ns.ajdustLangName(options.name);

        this.stationList = [];

        //observationGroups and observationGroupList = the gropup this location belongs to
        this.observationGroups = {};
        this.observationGroupList = [];

        //observationGroupStations = {observationGroup-id: Station} = ref to the Station (if any) used for the ObservationGroup
        this.observationGroupStations = {};
        this.observationGroupStationList = [];

        this.init();
    };


    nsObservations.Location.prototype = {

        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        /*****************************************************
        _getFuncList - Get an adjusted version of one of the function-lists:
        updateLastObservationFuncList, updateObservationFuncList, updateForecastFuncList
        *****************************************************/
        _getFuncList: function( listOrListName ){
            let list = typeof listOrListName == 'string' ? nsObservations[listOrListName] : listOrListName,
                result = [];
            list.forEach( (opt) => {
                let func;
                if (typeof opt == 'string')
                    func = this[opt].bind(this);
                else
                    if (typeof opt == 'function')
                        func = opt.bind(this);
                    else {
                        let method = opt.func,
                            context = opt.context || this;
                        func = (typeof method == 'string' ? context[method] : method).bind(context);
                    }
                result.push(func);
            }, this);
            return result;
        },

        _callFuncList: function( listOrListName, arg = []){
            this._getFuncList( listOrListName ).forEach( (func) => {
                func.apply(null, arg);
            });
            return this;
        },


        /*****************************************************
        loadObservation
        Load observation for all stations and parameter (if any) and update observationDataList and call location.updateObservation()
        NOTE: The data is only loaded ONCE since loading last observation will update observationDataList
        *****************************************************/
        loadObservation: function(){
            if (this.observationIsLoaded)
                this.updateObservation();
            else {
                this.observationIsLoaded = true;

                let stationUrls = {};
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    let promiseOptions = {
                            resolve: function(data) { station._resolveObservations(data, observationGroupId); },
                            reject: function(error){ station._rejectObservations(error, observationGroupId); },
                            noCache   : true,
                            retries   : 3,
                            retryDelay: 2*1000,
                            useDefaultErrorHandler: false
                        };

                    $.each(station.observation, function(parameterId, fileName){
                        let url = ns.dataFilePath(fileName);
                        if (stationUrls[url])
                            return;
                        stationUrls[url] = true;

                        Promise.getJSON(url, promiseOptions);
                    });
                });

            }
        },

        /*****************************************************
        loadForecast
        Load forecast for all stations and parameter (if any) and update forecastDataList and call location.updateForecast()
        *****************************************************/
        loadForecast: function(){
            if (this.forecastIsLoaded)
                this.updateForecast();
            else {
                this.forecastIsLoaded = true;

                //Load forecast for all parametre, but only once for each file/url
                let stationUrls = {};
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    let resolve = function(data) { station._resolveForecast(data,  observationGroupId); },
                        reject  = function(error){ station._rejectForecast (error, observationGroupId); };

                    $.each(station.forecast, function(parameterId, fileName){
                        let url = ns.dataFilePath(fileName);
                        if (stationUrls[url])
                            return;
                        stationUrls[url] = true;

                        window.intervals.addInterval({
                            fileName        : fileName,
                            resolve         : resolve,
                            reject          : reject,
                            duration        : 60, //Reload every 60 min

                            useDefaultErrorHandler: false,
                            retries         : 3,
                            retryDelay      : 2*1000,
                            promiseOptions  : {noCache: true}
                        });
                    });
                });
            }
        },


        /*********************************************
        updateLastObservation
        If any of the user is using this location =>
        call all the update-methods from updateLastObservationFuncList
        *********************************************/
        updateLastObservation: function(){
            return this._callFuncList('updateLastObservationFuncList', nsObservations.updateLastObservationFuncList);
        },

        /*********************************************
        updateObservation
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateObservationFuncList
        *********************************************/
        updateObservation: function( onlyGroupId ){
            //Update last observation
            this.updateLastObservation();

            //Call all the update-methods from updateObservationFuncList
            return this._callFuncList('updateObservationFuncList', [onlyGroupId]);
        },

        /*********************************************
        updateForecast
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateForecastFuncList
        *********************************************/
        updateForecast: function( onlyGroupId ){
             return this._callFuncList('updateForecastFuncList', [onlyGroupId]);
        },
    };

}(jQuery, this.i18next, this.moment, this, document));




;
/****************************************************************************
21_location-highcharts.js
Methods for creating Highcharts for a Location

****************************************************************************/
(function ($, Highcharts, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {},
        nsHC           = ns.hc = ns.highcharts = ns.highcharts || {};

    nsObservations.updateLastObservationFuncList.push('updateCharts');
    nsObservations.updateObservationFuncList.push('updateCharts');
    nsObservations.updateForecastFuncList.push('updateCharts');


    Highcharts.USE_JB_STYLE = true;

    /****************************************************************************
    Extend Location with methods for creating, showing an updating charts with observations and forecasts
    ****************************************************************************/
    $.extend(nsObservations.Location.prototype, {
        /*****************************************************
        showCharts
        *****************************************************/
        showCharts: function(mapId){
            let timeSeries = this.timeSeries = nsHC.timeSeries( this._getChartsOptions(true, mapId) );
            this.modalCharts =
                $.bsModal({
                    header          : this.getHeader(),
                    flexWidth       : true,
                    megaWidth       : true,
                    allowFullScreen : true,
                    content         : timeSeries.createChart.bind(timeSeries),
                    onClose         : function(){ this.timeSeries = null; return true; }.bind(this),
                    remove          : true,
                    show            : true
                });
        },


        /*****************************************************
        updateCharts
        To prevent multi update at the same time, the update
        is "delayed" 30 sek
        *****************************************************/
        updateCharts: function(){
            if (this.timeSeries){
                if (this.chartTimeoutId)
                    window.clearTimeout(this.chartTimeoutId);
                this.chartTimeoutId = window.setTimeout( this._updateCharts.bind(this), 30*1000);
            }
        },

        _updateCharts: function(){
            this.chartTimeoutId = null;
            if (this.timeSeries){
                let chartsOptions = this._getChartsOptions(true, 0);
                this.timeSeries.setAllData(chartsOptions.series);
            }
        },

        /*****************************************************
        _getChartsOptions
        *****************************************************/
        _getChartsOptions: function(inModal, mapOrMapId){
            let result = {
                    location : this.name,
                    parameter: [],
                    unit     : [],
                    series   : [],
                    yAxis    : [],
                    z        : [],
                    zeroLine : true,
                };


            this.stationList.forEach(station => {
                let stationChartsOptions = station.getChartsOptions(mapOrMapId, inModal);
                ['parameter', 'unit', 'series', 'yAxis', 'z'].forEach( id => result[id].push( stationChartsOptions[id] ) );
           });

           result.chartOptions = $.extend(true, result.chartOptions,
                inModal ? {

                } : {
                    chart: {
                        scrollablePlotArea: {
                            minWidth       : 2 * nsObservations.imgWidth,
                            scrollPositionX: 1
                        },

                        container: {
                            css: {
                                width : nsObservations.imgWidth +'px',
                                //height: nsObservations.imgHeight+'px',
                            }
                        }
                    }
                });
            return result;
        },

        /*****************************************************
        createCharts
        *****************************************************/
        createCharts: function(inModal, mapOrMapId){
            let timeSeriesOptions = this._getChartsOptions(inModal, mapOrMapId);

            let timeSeries = nsHC.timeSeries(timeSeriesOptions);
            return timeSeries;
        }
    });



}(jQuery, this.Highcharts, this.i18next, this.moment, this, document));



;
/****************************************************************************
22_location-table.js


****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {}/*,
        nsHC           = ns.hc = ns.highcharts = ns.highcharts || {}*/;

    nsObservations.updateLastObservationFuncList.push('updateTables');
    nsObservations.updateObservationFuncList.push('updateTables');
    nsObservations.updateForecastFuncList.push('updateTables');


    /****************************************************************************
    Extend Location with methods for creating, showing an updating tables with observations and forecasts
    ****************************************************************************/
    $.extend(nsObservations.Location.prototype, {
        /*****************************************************
        showCharts
        *****************************************************/
        showTables: function(/*mapId*/){
            let dataList = [],  //[]{timestamp, NxGROUP_ID: {obs:STRING, for:STRING}}
                dataObj  = {};  //{timestamp}{NxGROUP_ID: {obs:STRING, for:STRING}}

            //Create dataObj
            this.stationList.forEach(station => {
                let groupId = station.observationGroup.id;
                $.each(station.getTableDataList(), (id, data) => {
                    if (data[groupId]){
                        let singleDataObj = dataObj[data.timestampValue] = dataObj[data.timestampValue] || {};
                        singleDataObj[groupId] = data[groupId];
                    }
                });
            });

            //Convert dataObj => dataList
            $.each(dataObj, (timestampValue, data) => {
                data.timestampValue = timestampValue;
                data.timestampMoment = moment(parseInt(data.timestampValue));
                dataList.push(data);
            });
            dataList.sort((data1, data2) => data1.timestampValue - data2.timestampValue );


            //Set options for table
            let tableOptions = {
                fullWidth: true,
                firstColumnFixed: true,
                columns: [{
                    id          : 'timestampMoment',
                    header      : {icon:'fa-clock', text: {da:'Tidsp.', en:'Time'}},
                    fixedWidth  : true,
                    align       : 'center',
                    vfFormat    : 'datetime_short',
                    noWrap      : true
                }],
                content: dataList
            };

            this.observationGroupList.forEach( obsGroup => {
                //@todo if gruppe skal medtages (includeAll or selected in map/location MANGLER
                tableOptions.columns.push({
                    id    : obsGroup.id,
                    header: {
                        //icon     : obsGroup.faIcon,
                        iconClass: obsGroup.faIconClass,
                        text     : obsGroup.tableHeader,
                    },
                    align : 'center',
                    noWrap: true,

                    minimizable : true,
                    //minimized: true,
                    title        : obsGroup.tableTitle,
                    minimizedIcon: obsGroup.faIcon,
vfFormat:'NIELS',

                });
            });

let bsTable = $.bsTable( tableOptions );

this.modalTables =  bsTable.asModal({
                        header   : this.getHeader(),
                        flexWidth: true,
                        megaWidth: true,
                        //content  : timeSeries.createChart.bind(timeSeries),
                        //onClose: function(){ this.timeSeries = null; return true; }.bind(this),
                        remove : true,
                        show   : true
                    });

/*
            let timeSeries = this.timeSeries = nsHC.timeSeries( this._getChartsOptions(true, mapId) );

            this.modalCharts =
                $.bsModal({
                    header   : this.getHeader(),
                    flexWidth: true,
                    megaWidth: true,
                    content  : timeSeries.createChart.bind(timeSeries),
                    _content  : function( $body ){
                        this.timeSeries.createChart($body);
                    }.bind(this),

                    onClose: function(){ this.timeSeries = null; return true; }.bind(this),
                    remove : true,
                    show   : true
                });
*/
        },


        /*****************************************************
        updateTables
        *****************************************************/
        updateTables: function(){
        },




        /*****************************************************
        createTables
        *****************************************************/
        createTables: function(/*$container*/){

        }
    });



}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
observation-group.js

ObservationGroup = group of Locations with the same parameter(-group)
****************************************************************************/
(function ($, i18next, moment, window, document, undefined) {
	"use strict";

	window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};


    /*****************************************************
    ObservationGroup
    Represent a set of locations with have the same parameter or parameter-group

    The "icon" is added to each Locations' marker on the map to indicated witch group
    the location contains.

    Each group has a method to format a set of parameter and there values to a single text.
    "Wind" using wind-speed, wind-direction ad gust-speed to form something a la "12 (14) m/s NNW"
    "SEALEVEL" forms sea-level as "1.3 m"
    *****************************************************/
    nsObservations.ObservationGroup = function(options, observations){
        this.options = $.extend(true, {}, {
                directionFrom : true,//false,
                allNeeded     : true,
                maxDelay      : "PT1H",
                maxGap        : 60,
                historyPeriod : "PT30H",
                faArrow       : 'fas fa-up-long'

            }, options);
        this.id = options.id;
        this.name = options.name;
        this.shortName = options.shortName || this.name;

        this.z = options.z || '';

        this.maxDelayValueOf = moment.duration(this.options.maxDelay).valueOf();
        this.observations = observations;
        this.locationList = [];
        this.locations = {};

        this.parameterList = Array.isArray(options.parameterId) ? options.parameterId : options.parameterId.split(' ');
        this.primaryParameter = nsParameter.getParameter(this.parameterList[0]);

/*
        this.directionArrow = {
            dir   : 'images/',
            src   : options.arrow || 'fas-arrow-up.svg',
            width : options.arrowWidth || 16,
            height: options.arrowHeight || 16,
        };
*/
        if (options.arrow)
            this.directionArrow = {
                id  : options.arrow,
                dim : options.arrowDim || 16
            };

        //Find header = name [unit] used by primary-parameter
        let primaryUnit = nsParameter.getUnit(this.options.formatUnit || this.primaryParameter.unit);

        this.header = {};
        this.shortHeader = {};
        this.tableHeader = {};
        this.tableTitle = {};
        $.each(i18next.options.languages || i18next.languages, function(index, lang){
            let name      = this.name[lang]      || this.name['en'],
                shortName = this.shortName[lang] || this.shortName['en'],
                unitName  = '[' + (primaryUnit.name[lang] ||  primaryUnit.name['en']) + ']';

            this.header[lang]      =          name      + ' '    + unitName;
            this.shortHeader[lang] =          shortName + ' '    + unitName;
            this.tableHeader[lang] = /*'<br>' +*/ shortName;// + '<br>' + unitName;
            this.tableTitle[lang]  =          shortName;

        }.bind(this));


        this.init();
    };


    nsObservations.ObservationGroup.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },


        /*********************************************
        _promise_setup: Load setup-file with stations and meta-data
        *********************************************/
        _promise_setup: function(){
            if (this.options.fileName)
                ns.promiseList.append({
                    fileName: ns.dataFilePath({subDir: this.observations.options.subDir.observations, fileName: this.options.fileName}),
                    resolve : this._resolve_setup.bind(this)
                });
        },

        /*********************************************
        _resolve_setup:
        *********************************************/
        _resolve_setup: function( options ){
            (options.locationList || options.list || []).forEach( locationOptions => {
                //Check if the location is set to be inactive
                let location = this.observations.locations[locationOptions.id];

                let defaultStationOptions =
                    $.extend(true, {}, options.default_station, {
                        level       : locationOptions.level     || undefined,
                        refLevel    : locationOptions.refLevel  || undefined,
                        owner       : locationOptions.owner     || undefined,
                        provider    : locationOptions.provider  || undefined,
                        position    : locationOptions.position  || undefined,
                        parameter   : locationOptions.parameter || locationOptions.parameterList || undefined
                });




                //Each observation-group can only have one station on each location
                let stationList = locationOptions.station || locationOptions.stationId || locationOptions.stationList;

                delete locationOptions.station;
                delete locationOptions.stationId;
                delete locationOptions.stationList;

                if (typeof stationList == 'string')
                    stationList = stationList.split(' ');
                stationList = Array.isArray(stationList) ? stationList : [stationList];

                let stationOptionsToUse = null;

                stationList.forEach( stationOptions => {
                    if (typeof stationOptions == 'string')
                        stationOptions = {id: stationOptions};

                    stationOptions = $.extend(true, {}, defaultStationOptions, locationOptions, stationOptions );
                    stationOptions.parameter = stationOptions.parameter || stationOptions.parameterList;

                    if (stationOptions.active === false)
                        return;

                    //Use first station or the one with prioritized = true
                    stationOptionsToUse = stationOptions.prioritized ? stationOptions : stationOptionsToUse || stationOptions;
                });


                if (stationOptionsToUse){
                    //Create a Station and connect Station, Location, and ObservationGroup (this)
                    let station = new nsObservations.Station(stationOptionsToUse, location, this);


                    //Connect location to the new station
                    location.stationList.push(station);
                    location.observationGroupStations[this.id] = station;
                    location.observationGroupStationList.push(station);

                    //Connect Location and ObservationGroup
                    if (!this.locations[location.id]){
                        this.locations[location.id] = location;
                        this.locationList.push(location);
                    }
                    if (!location.observationGroups[this.id]){
                        location.observationGroups[this.id] = this;
                        location.observationGroupList.push(this);
                        location.observationGroupList.sort( (ob1, ob2) => { return ob1.options.index - ob2.options.index; } );
                    }
                }
            }, this); //forEach( locationOptions => {...


            //Read last measurement every 3 min. Start after station-lists are loaded
            //Only in test-mode: window.intervals.options.durationUnit = 'seconds';
            let lastObservationFileName = this.options.lastObservationFileName;
            if (lastObservationFileName)
                window.intervals.addInterval({
                    duration        : 3,
                    fileName        : {mainDir: true, subDir:   this.observations.options.subDir.observations, fileName: lastObservationFileName},
                    resolve         : this._resolve_last_measurment,
                    reject          : this._reject_last_measurment,
                    context         : this,
                    useDefaultErrorHandler: false,
                    retries         : 3,
                    retryDelay      : 2*1000,
                    promiseOptions  : {noCache: true}
                });
        },










        /*****************************************************
        _resolve_last_measurment
        Split geoJSON into a {features:[]} for each station
        *****************************************************/
        _resolve_last_measurment: function(geoJSON){
            let obs = this.observations,
                stationGeoJSONs = {};

            geoJSON.features.forEach( feature => {
                let stationId = feature.properties.id,
                    stationGeoJSON = stationGeoJSONs[stationId] = stationGeoJSONs[stationId] || {features:[]};
                stationGeoJSON.features.push(feature);
            });

            //Load each geoJSON "file" into station
            $.each(stationGeoJSONs, function(findStationId, geoJSON){
                obs.locationList.forEach( location => {
                    let update = false;
                    location.stationList.forEach( station => {
                        if ((station.id == findStationId) && station.observationGroup && (station.observationGroup.id == this.id)){
                            station._resolveGeoJSON(geoJSON, false);
                            update = true;
                        }
                    });
                   if (update)
                        location.updateObservation();
                });
            }.bind(this));
        },

        /*****************************************************
        _reject_last_measurment
        *****************************************************/
        _reject_last_measurment: function(){
            //Update observations to hide last measurements if they get to old
            this.observations.locationList.forEach( location => location.updateObservation() );
            //return error;
        },


        /*********************************************
        _getMapOptions(mapOrMapId)
        Return the coresponding record in ns.FCOOObservations.maps =
        {map, $container, geoJSONLayer, dataAdded}
        *********************************************/
        _getMapOptions: function(mapOrMapId){
            return this.observations.maps[ nsObservations.getMapId(mapOrMapId) ];
        },

        /*********************************************
        isVisible(mapOrMapId) - return true if this is visible on the Map mapId
        *********************************************/
        isVisible: function(mapOrMapId){
            let mapOptions = this._getMapOptions(mapOrMapId),
                $container = mapOptions ? mapOptions.$container : null;

            return $container ? this._getMapOptions(mapOrMapId).$container.hasClass('obs-group-'+this.options.index) : false;
        },

        /*********************************************
        show(mapOrMapId) Show the locations in the group on the map
        *********************************************/
        show: function(mapOrMapId){
            return this.toggle(mapOrMapId, true);
        },

        /*********************************************
        hide(mapOrMapId) Hide the locations in the group on the map
        *********************************************/
        hide: function(mapOrMapId){
            return this.toggle(mapOrMapId, false);
        },

        /*********************************************
        toogle(mapOrMapId, show) Show/Hide the locations in the group on the map
        *********************************************/
        toggle: function(mapOrMapId, show){
            let className  = 'obs-group-'+this.options.index,
                mapId      = typeof mapOrMapId == 'string' ? mapOrMapId : nsObservations.getMapId(mapOrMapId),
                mapOptions = this._getMapOptions(mapOrMapId),
                $container = mapOptions ? mapOptions.$container : null;

            if ($container){
                if (show == undefined)
                    show = !this.isVisible(mapOrMapId);
                $container.modernizrToggle(className, !!show);

                //Toggle class multi-obs-group to mark multi groups visible on the map
                let visibleGroups = 0;
                for (var i=0; i<20; i++){
                    if ($container.hasClass('obs-group-'+i)){
                        visibleGroups++;
                    }
                }
                $container.modernizrToggle('multi-obs-group', visibleGroups > 1);
            }

            //Close all open popups with no visible observationGroup
            $.each(this.locations, function(id, location){
                if (location.popups[mapId] && !show && !location.isVisible(mapId)){
                    location.popups[mapId]._pinned = false;
                    //location.popups[mapId]._close();
                    location.popups[mapId].close();
                }
            });

            //Update this.observations.state
            let stateId = this.id+'_'+mapId;
            this.observations.state = this.observations.state || {};
            this.observations.state[stateId] = !!show;
            return this;
        },


        /*********************************************
        openVisiblePopup(mapOrMapId)
        Open popup for all locations visible at the map
        *********************************************/
        openVisiblePopup: function(mapOrMapId){
            let mapId = nsObservations.getMapId(mapOrMapId),
                mapBounds = this._getMapOptions(mapId).map.getBounds();

            if (!this.isVisible(mapId))
                this.show(mapId);

            //Open all not-open location within the maps current bounds
            $.each(this.locations, function(id, location){
                if (mapBounds.contains(location.latLng))
                    location.popupMinimized(mapId);
            });
        },

        /*********************************************
        closeVisiblePopup(mapOrMapId)
        Close popup for all locations visible at the map
        *********************************************/
        closeVisiblePopup: function(mapOrMapId){
            let mapId = nsObservations.getMapId(mapOrMapId),
                mapBounds = this._getMapOptions(mapId).map.getBounds();

            //Close all open location within the maps current bounds
            $.each(this.locations, function(id, location){
                if (mapBounds.contains(location.latLng) && location.markers[mapId] && location.popups[mapId]){
                    location.popups[mapId]._setPinned(false);
                    location.markers[mapId].closePopup();
                }
            });
        },
    };

}(jQuery, this.i18next, this.moment, this, document));
;
/****************************************************************************
station.js

Station  = Single observation-station with one or more parametre.
Only one station pro Location within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window, document, undefined) {
    "use strict";

    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    function _Math(mathMethod, value1, value2){
        let isNumbers = (isNaN(value1) ? 0 : 1) + (isNaN(value2) ? 0 : 1);
        if (isNumbers == 2) return Math[mathMethod](value1, value2);
        if (isNumbers == 0) return undefined;
        return isNaN(value1) ? value2 : value1;
    }
    function max(value1, value2){ return _Math('max', value1, value2); }
    function min(value1, value2){ return _Math('min', value1, value2); }

    /*****************************************************
    Station
    Represent a station with one or more parameters
    *****************************************************/
    nsObservations.Station = function(options, location, observationGroup){
        this.id = options.id;
        this.options = options;
        this.location = location;
        this.observationGroup = observationGroup;

        this.parameterList = [];
        this.parameters = {};
        this.vectorParameterList = [];
        this.primaryParameter = null;

        function getAsList(opt){
            return Array.isArray(opt) ? opt : opt.split(' ');
        }

        //Set this.parameter = []{id:STRING, parameter:PARAMETER, unit:UNIT}
        let parameterList = getAsList(options.parameter),
            unitList      = options.unit ? getAsList(options.unit) : [];

        let addParameter = function(index, parameterId){
            let parameter = nsParameter.getParameter(parameterId),
                unit = index < unitList.length ? nsParameter.getUnit(unitList[index]) : parameter.unit,
                newParameter = {
                    id       : parameterId,
                    parameter: parameter,
                    unit     : unit
                };

            this.primaryParameter = this.primaryParameter || parameter;

            //If it is a vector => add speed- direction-, eastward-, and northward-parameter
            if (parameter.type == 'vector'){
                this.vectorParameterList.push(parameter);
                if (parameter.speed_direction.length){
                    addParameter(index, parameter.speed_direction[0].id);
                    addParameter(99999, parameter.speed_direction[1].id);
                }
                if (parameter.eastward_northward.length){
                    addParameter(index, parameter.eastward_northward[0].id);
                    addParameter(index, parameter.eastward_northward[1].id);
                }
            }

            this.parameterList.push(newParameter);
            this.parameters[newParameter.parameter.id] = newParameter;
        }.bind(this);

        $.each(parameterList, addParameter);

        this.observationDataList = []; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}
        this.forecastDataList    = []; //                    do

        /*
        Metadata for observations and forecast = {
            PARAMETER_ID: {
                timestamp: DATE_STRING      - When was det data changed
                unit     : UNIT or UNIT_ID  - The unit the data are in
                epoch    : DATE_STRING      - Epoch of the forecast
            }
        }
        */
        this.observationMetaData = {};
        this.forecastMetaData    = {};

        //Adjust options.observation and options.forecast to be {STANDARD_NAME: {subDir: STRING, fileName:STRING}}
        let adjust = function(options, subDirId){
            if (!options) return false;
            let newOptions = options;
            if (typeof options == 'string'){
                newOptions = {};
                $.each(this.parameters, function(parameterId){
                    newOptions[parameterId] = options;
                });
            }

            $.each(newOptions, function(parameterId, fileName){
                fileName = fileName.replace('{id}', this.id);
                newOptions[parameterId] = {mainDir: true, subDir: this.location.observations.options.subDir[subDirId], fileName: fileName};
            }.bind(this));

            return newOptions;
        }.bind(this);

        this.observation = adjust(options.observation, 'observations');
        this.forecast    = adjust(options.forecast,    'forecasts'   );


        //Set the format- and format-stat-method
        let formatterMethod     = observationGroup.options.formatterMethod,
            formatterStatMethod = observationGroup.options.formatterStatMethod;

        this.formatter     = formatterMethod     && this[formatterMethod]     ? this[formatterMethod]     : this.formatterDefault;
        this.formatterStat = formatterStatMethod && this[formatterStatMethod] ? this[formatterStatMethod] : this.formatterStatDefault;



    };


    nsObservations.Station.prototype = {
        /*****************************************************
        getDataList
        Return array of [timestamp, value] value = []FLOAT
        timestamp can be NUMBER or STRING
        *****************************************************/
        getDataList: function(parameter, forecast, minTimestampValue = 0, maxTimestampValue = Infinity, clip){
            let isVector         = parameter.type == 'vector',
                scaleParameter   = isVector ? parameter.speed_direction[0] : parameter,
                scaleParameterId = scaleParameter.id,
                dirParameterId   = isVector ? parameter.speed_direction[1].id : null,

                unit     = scaleParameter.unit,
                toUnit   = this.getDisplayUnit(scaleParameter),

                result   = [],
                dataList = forecast ? this.forecastDataList : this.observationDataList; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}

            $.each(dataList, function(index, dataSet){
                let timestampValue = moment(dataSet.timestamp).valueOf(),
                    value          = dataSet[scaleParameterId];


                if ((timestampValue >= minTimestampValue) && (timestampValue <= maxTimestampValue )){
                    //timestampValue inside min-max-range
                    let add = true;
                    if (clip){
                        //Check if timestampValue is OUTSIDE clip[0] - clip[1]
                        add = (timestampValue <= clip[0]) || (timestampValue >= clip[1]);
                    }
                    if (add){
                        value = nsParameter.convert(value, unit, toUnit);
                        result.push([
                            timestampValue,
                            isVector ? [value, dataSet[dirParameterId]] : value
                        ]);
                    }
                }
            });
            result.sort(function(timestampValue1, timestampValue2){ return timestampValue1[0] - timestampValue2[0];});
            return result;
        },


        /*****************************************************
        getDefaultObsAndForecast()
        Return an object with allmost all the content needed for
        creating charts or tables
        *****************************************************/
        getDefaultObsAndForecast: function(){
            let obsGroupOptions = this.observationGroup.options,
                parameter       = this.primaryParameter,
                result = {
                    startTimestampValue: moment().valueOf() - moment.duration(obsGroupOptions.historyPeriod).valueOf(),
                    parameter          : this.primaryParameter,
                    isVector           : parameter.type == 'vector',

                    forecastDataList           : null,
                    firstObsTimestampValue     : null,
                    lastObsTimestampValue      : null,
                    lastTimestampValueBeforeObs: 0,
                    firstTimestampValueAfterObs: Infinity
                };

            result.scaleParameter = result.isVector ? parameter.speed_direction[0] : parameter,
            result.obsDataList    = this.getDataList(parameter, false, result.startTimestampValue);
            result.unit           = this.getDisplayUnit(result.scaleParameter);

            if (this.forecast){
                result.forecastDataList = this.getDataList(parameter, true);
                result.firstObsTimestampValue = result.obsDataList.length ? result.obsDataList[0][0]                           : result.startTimestampValue;
                result.lastObsTimestampValue  = result.obsDataList.length ? result.obsDataList[result.obsDataList.length-1][0] : result.startTimestampValue;

                result.forecastDataList.forEach( data => {
                    let timestampValue = data[0];
                    if (timestampValue < result.firstObsTimestampValue)
                        result.lastTimestampValueBeforeObs = Math.max(timestampValue, result.lastTimestampValueBeforeObs);
                    if (timestampValue > result.lastObsTimestampValue)
                        result.firstTimestampValueAfterObs = Math.min(timestampValue, result.firstTimestampValueAfterObs);
                });

                //Data for forecast before AND after first and last observation
                result.forecastDataListNoObs = this.getDataList(parameter, true, result.startTimestampValue, Infinity, [result.lastTimestampValueBeforeObs, result.firstTimestampValueAfterObs]);

                //Data for forecast when there are observations
                result.forecastDataListWithObs = this.getDataList(parameter, true, result.lastTimestampValueBeforeObs, result.firstTimestampValueAfterObs);
            }

            return result;
        },

        /*****************************************************
        getDataSet(indexOrTimestampOrMoment, forecast)
        indexOrTimestampOrMoment:
            true => last dataSet
            number => index
            moment => moment.toISOString
            string => find dataSet with same timestamp
        *****************************************************/
        getDataSet: function(indexOrTimestampOrMoment, forecast){
            let dataList = forecast ? this.forecastDataList : this.observationDataList,
                result = null;

            if (!dataList.length)
                return null;

            //indexOrTimestampOrMoment == true => last dataSet
            if (indexOrTimestampOrMoment === true)
                return dataList[dataList.length-1];

            if (typeof indexOrTimestampOrMoment == 'number')
                return indexOrTimestampOrMoment < dataList.length ? dataList[indexOrTimestampOrMoment] : null;

            if (indexOrTimestampOrMoment instanceof moment){
                indexOrTimestampOrMoment = indexOrTimestampOrMoment.utc().toISOString();
            }

            //Find dataSet with timestamp == indexOrTimestampOrMoment
            dataList.forEach(dataSet => {
                if (dataSet.timestamp == indexOrTimestampOrMoment){
                    result = dataSet;
                    return true;
                }
            });
            return result;
        },

        /*****************************************************
        formatDataSet
        Return a formated string with the data
        Using this.formatter that is set by when the Station was created
        *****************************************************/
        formatDataSet: function(dataSet, forecast){

            if (!dataSet)
                return '?';

            //Check if all parameters has a value in dataSet
            let hasValueForAllParameters = true;
            function checkIfValuesExists(parameterList){
                $.each(parameterList, function(index, parameter){
                    if (dataSet[parameter.id] == undefined)
                        hasValueForAllParameters = false;
                });
            }
            $.each(this.parameters, function(parameterId, parameterOptions){
                let parameter = parameterOptions.parameter;
                if (parameter.type == "vector"){
                    //Check if there are values for speed/direction/eastware/northware
                    checkIfValuesExists(parameter.speed_direction);
                    checkIfValuesExists(parameter.eastward_northward);
                }
                else
                    checkIfValuesExists([parameter]);
            });

            //If all parameter are nedded and not all have value => return '?'
            if (!this.observationGroup.options.allNeeded && !hasValueForAllParameters)
                return '?';

            return this.formatter(dataSet, forecast);
        },

        /*****************************************************
        datasetIsRealTime(dataSet)
        Return true if the timestamp of the dataset is not to old
        "To old" is given by the observationGroup
        *****************************************************/
        datasetIsRealTime: function(dataSet){
            return dataSet && (moment().valueOf() <= (moment(dataSet.timestamp).valueOf() + this.observationGroup.maxDelayValueOf));
        },

        /*****************************************************
        getStat
        Calc the total stat for the given interval.
        Every hour is weighed equally
        *****************************************************/
        getStat: function(fromHour, toHour, forecast){
            let stat = {},
                statList = forecast ? this.forecastStatList : this.observationStatList;

            $.each(statList, function(hourValue, hourStat){
                if ((hourValue >= fromHour) && (hourValue <= toHour)){
                    $.each(this.parameters, function(parameterId){
                        let parameterHourStat = hourStat[parameterId];
                        if (parameterHourStat != undefined){
                            let parameterStat = stat[parameterId] = stat[parameterId] || {
                                    hours: toHour-fromHour+1,
                                    count: 0,
                                    min  : undefined,
                                    mean : 0,
                                    max  : undefined
                                };
                            parameterStat.min = min(parameterStat.min, parameterHourStat.min);
                            parameterStat.max = max(parameterStat.max, parameterHourStat.max);
                            //Mean of forecast and mean of observations is calculated as one value pro hour is used, regardless of the number of timestamps pro hour.
                            parameterStat.mean = (parameterStat.mean*parameterStat.count + parameterHourStat.mean)/(parameterStat.count+1);
                            parameterStat.count++;
                        }
                    });
                }
            }.bind(this));
            return stat;
        },


        /*****************************************************
        getPeriodStat(periodIndex, forecast)
        get the stat for period from/to now to/from nsObservations.observationPeriods[periodIndex]/nsObservations.forecastPeriods[periodIndex]
        Ex. getPeriodStat(1, true) will return the stat for the perion now (=0) to nsObservations.forecastPeriods[1] (default = 6);
        *****************************************************/
        getPeriodStat: function(periodIndex, forecast){
            if (forecast)
                return this.getStat(0/*fromHour*/, nsObservations.forecastPeriods[periodIndex]-1/*toHour*/, true/*forecast*/) || {};
            else
                return this.getStat(-1*nsObservations.observationPeriods[periodIndex]+1/*fromHour*/, 0/*toHour*/, false/*forecast*/ ) || {};
        },

        /*****************************************************
        formatStat
        Return a formated string with the stat
        Using this.formatterStat that is set when the Station was created
        *****************************************************/
        formatStat: function(stat, forecast){

            //Check that valid stat exists for alle parameters
            let statOk = true;
            function checkIfStatsExists(parameterList){
                $.each(parameterList, function(index, parameter){
                    let parameterStat = stat[parameter.id];
                    if (
                          !parameterStat ||
                          (parameterStat.count < parameterStat.hours * (forecast ? nsObservations.forecast_minimumPercentValues : nsObservations.observation_minimumPercentValues)) ||
                          (parameterStat.min == undefined) ||
                          (parameterStat.max == undefined)
                        )
                        statOk = false;
                });
            }
            $.each(this.parameters, function(parameterId, parameterOptions){
                let parameter = parameterOptions.parameter;
                if (parameter.type == "vector"){
                    checkIfStatsExists(parameter.speed_direction);
                    checkIfStatsExists(parameter.eastward_northward);
                }
                else
                    checkIfStatsExists([parameter]);
            });

            return statOk ? this.formatterStat(stat, forecast) : "?";
        },

        /*****************************************************
        formatPeriodStat
        Return a formated string with the stat from getPeriodStat
        *****************************************************/
        formatPeriodStat: function(periodIndex, forecast){
            return this.formatStat( this.getPeriodStat(periodIndex, forecast), forecast );
        },

        /**********************************************************************************************************
        **********************************************************************************************************/
        //formatter(dataSet, forecast) return a string with the value and units for the parameters in this station.
        //Is set when the Station was created
        formatter: function(/* dataSet, forecast */){ return 'ups'; },

        //formatXX(dataSet, forecast) Different format-methods for displaying single data-set

        /*****************************************************
        formatValue(value, parameter, unit)
        Return value formatted. Convert to this.options.formatUnit if needed
        *****************************************************/
        formatValue: function(value, parameter, unit, noUnitStr = false){
            return nsParameter.getParameter(parameter).format(value, !noUnitStr, unit);
        },

        /*****************************************************
        getDisplayUnit - Return the Unit to display the parameter in
        *****************************************************/
        getDisplayUnit: function(parameter){
            let parameterUnit = nsParameter.getParameter(parameter).unit,
                displayUnit   = nsParameter.getUnit(this.observationGroup.options.formatUnit || parameterUnit);

            //If displayUnit and parameterUnit are the same physical unit => use displayUnit else use parameter default unit
            if (
                (displayUnit.SI_unit && parameterUnit.SI_unit && (displayUnit.SI_unit == parameterUnit.SI_unit)) || //Both units have same SI-unit, OR
                (displayUnit.SI_unit == parameterUnit.id) ||                                                        //One of the units are the other unit's SI-unit
                (displayUnit.id == parameterUnit.SI_unit)
               )
                return displayUnit;
            else
                return parameterUnit;
        },

        /*****************************************************
        formatParameter - Simple display parameter
        *****************************************************/
        formatParameter: function(dataSet, parameter, forecast, noUnitStr){
            parameter = nsParameter.getParameter(parameter);

            let value         = dataSet[parameter.id],
                parameterUnit = parameter.unit,
                metaData      = (forecast ? this.forecastMetaData : this.observationMetaData)[parameter.id],
                valueUnit     = nsParameter.getUnit(metaData.unit || parameterUnit);

            //If parameter unit and value unit are differnet  => convert value to parameter unit
            if (parameterUnit.id != valueUnit.id)
                value = nsParameter.convert(value, valueUnit, parameterUnit);

            return this.formatValue(value, parameter, this.getDisplayUnit(parameter), noUnitStr);

        },

        /*****************************************************
        formatterDefault - Simple display the first parameter
        *****************************************************/
        formatterDefault: function(dataSet, forecast){
            return this.formatParameter(dataSet, this.parameterList[0].parameter, forecast);
        },

        /*****************************************************
        getVectorFormatParts
        Get all parts of a vector-parameter.
        Return []{vectorParameterId, speedParameterId, directionParameterId, speedStr, speed, unitStr, speedAndUnitStr, directionStr, direction, directionArrow, defaultStr}
        *****************************************************/
        getVectorFormatParts: function(dataSet, forecast){
            let result = [];
            this.vectorParameterList.forEach(function(vectorParameter){
                let speedParameterId     = vectorParameter.speed_direction[0].id,
                    directionParameter   = vectorParameter.speed_direction[1],
                    directionParameterId = directionParameter.id,
                    direction            = dataSet[directionParameterId],
                    oneVectorResult = {
                        vectorParameterId   : vectorParameter.id,
                        speedParameterId    : speedParameterId,
                        directionParameterId: directionParameterId,

                        speedStr         : this.formatParameter(dataSet, speedParameterId, forecast, true),
                        speed            : dataSet[speedParameterId],
                        unitStr          : this.getDisplayUnit(speedParameterId).translate('', '', true),
                        speedAndUnitStr  : this.formatParameter(dataSet, speedParameterId, forecast, false),

                        directionStr     : directionParameter.asText( dataSet[directionParameterId] ),
                        direction        : direction,
                        directionArrow   : '<i class="fa-direction-arrow ' + this.observationGroup.options.faArrow + '" style="rotate:'+direction+'deg;"></i>',
                        defaultStr       : ''
                    };

//dir-text + speed  oneVectorResult.defaultStr = oneVectorResult.directionStr + ' ' + oneVectorResult.speedAndUnitStr;
//dir-arrow + speed oneVectorResult.defaultStr = oneVectorResult.directionArrow + ' ' + oneVectorResult.speedAndUnitStr;
/* Speed + dir-arrow */
                oneVectorResult.defaultStr = oneVectorResult.speedAndUnitStr + ' ' + oneVectorResult.directionArrow;
                result.push(oneVectorResult);
            }.bind(this));
            return result;
        },

        /*****************************************************
        formatterVectorDefault - Display for the first vector-parameter
        *****************************************************/
        formatterVectorDefault: function(dataSet, forecast){
            return this.getVectorFormatParts(dataSet, forecast)[0].defaultStr;
        },

        /*****************************************************
        formatterVectorWind
        *****************************************************/
        formatterVectorWind: function(dataSet, forecast){
            let vectorPart = this.getVectorFormatParts(dataSet, forecast)[0];

            //TODO: Include wind-gust a la NNW 12 (14) m/s

            return vectorPart.defaultStr;
        },


        /*********************************************
        **********************************************
        formatterStatXX(stat, station)
        Different format-methods for the displaying statistics a single time period for different groups
        **********************************************
        *********************************************/
        //formatterStat(stat, forecast) return a string with the max, mean, min values
        //Is set by this.addObservationGroup
        formatterStat: function(/*stat, forecast*/){ return 'ups'; },



        /*****************************************************
        formatStatMinMaxMean
        *****************************************************/
        formatStatMinMaxMean: function(minStr, maxStr, meanStr, twoLines){
            return minStr + ''+ nsObservations.toChar + '' + maxStr + (twoLines ? '<br>' : ' ') + '(' + meanStr +')';
        },


        /*****************************************************
        formatStatParameter - Simple display stat for the first parameter
        *****************************************************/
        formatStatParameter: function(statId, stat, parameter, forecast, noUnitStr){
            let parameterId = nsParameter.getParameter(parameter).id,
                dataSet = {};
            dataSet[parameterId] = stat[parameterId][statId];

            return this.formatParameter(dataSet, parameter, forecast, noUnitStr);
        },


        /*****************************************************
        formatterStatDefault - Simple display stat for the first parameter
        *****************************************************/
        formatterStatDefault: function(stat, forecast){
            let parameter = this.parameterList[0].parameter;
            return this.formatStatMinMaxMean(
                this.formatStatParameter('min',  stat, parameter, forecast, true),
                this.formatStatParameter('max',  stat, parameter, forecast, true),
                this.formatStatParameter('mean', stat, parameter, forecast, true)
            );
        },

        /*****************************************************
        formatterStatVectorParameter
        Display stat for the a vector-parameter.
        Mean direction is calc from mean northward and mean eastward
        *****************************************************/
        formatterStatVectorParameter: function(stat, vectorParameter, forecast){
            let speedId       = vectorParameter.speed_direction[0].id,
                directionId   = vectorParameter.speed_direction[1].id,
                eastwardId    = vectorParameter.eastward_northward[0].id,
                eastwardMean  = stat[eastwardId].mean,
                northwardId   = vectorParameter.eastward_northward[1].id,
                northwardMean = stat[northwardId].mean;

            //Create dataSet with 'dummy' speed and mean direction
            let dataSet = {};
            dataSet[speedId]     = 1;
            dataSet[directionId] = 360 * Math.atan2(eastwardMean, northwardMean) / (2*Math.PI);

            let meanText    = this.formatStatParameter('mean', stat, speedId, forecast, true),
                vectorParts = this.getVectorFormatParts(dataSet, forecast)[0];

            return  this.formatStatMinMaxMean(
                        this.formatStatParameter('min',  stat, speedId, forecast, true),
                        this.formatStatParameter('max',  stat, speedId, forecast, true),
//                      vectorParts.directionStr + ' ' + meanText,   // Dir-text + speed
//                      vectorParts.directionArrow + ' ' + meanText, // Dir-arrow + speed
                        vectorParts.directionArrow + ' ' + meanText, // Speed + dir-arrow
                        true    //twoLines
                    );
        },

        /*****************************************************
        formatterStatVectorDefault
        Display stat for the first vector-parameter.
        *****************************************************/
        formatterStatVectorDefault: function(stat, forecast){
            return this.formatterStatVectorParameter(stat, this.vectorParameterList[0], forecast);
        },

        /*****************************************************
        formatteStatVectorWind - TODO
        *****************************************************/
        formatterStatVectorWind: function(stat, forecast){
            return this.formatterStatVectorDefault(stat, forecast);
        },



        /**********************************************************************************************************
        **********************************************************************************************************/

        /*****************************************************
        _resolveGeoJSON
        Convert observation or forecast from GEOJSON-file
        *****************************************************/
        _resolveGeoJSON: function(geoJSON, forecast){
            let dataList = forecast ? this.forecastDataList : this.observationDataList,
                metaData = forecast ? this.forecastMetaData : this.observationMetaData,
                features = geoJSON ? geoJSON.features : null;

            //Load new data
            features.forEach(function(feature){
                let properties  = feature.properties,
                    parameterId = properties.standard_name;


                //If the Station do not have the parameter => do not update
                if (!this.parameters[parameterId])
                    return;

                //Update meta-data
                metaData[parameterId] = $.extend(metaData[parameterId] || {}, {
                    unit            : properties.units,
                    owner           : properties.owner,
                    reference_level : properties.reference_level,
                    timestamp       : geoJSON.timestamp
                });

                $.each(properties.value, function(valueIndex, value){
                    if ((typeof value == 'number') && (value != properties.missing_value)){
                        let newDataSet = {timestamp: moment(properties.timestep[valueIndex]).utc().toISOString()},
                            found      = false;
                        newDataSet[parameterId] = value;

                        //Add parameterId, value, timestamp to
                        dataList.forEach((dataSet) => {
                            if (dataSet.timestamp == newDataSet.timestamp){
                                dataSet = $.extend(dataSet, newDataSet);
                                found = true;
                                return true;
                            }
                        });

                        if (!found)
                            dataList.push(newDataSet);
                    }
                });
            }.bind(this));

            //Sort by timestamp
            dataList.sort(function(dataSet1, dataSet2){
                return dataSet1.timestamp.localeCompare(dataSet2.timestamp);
            });


            //If the station contains vector-parameter => calc speed, direction, eastware and northware for all dataSet
            if (this.vectorParameterList)
                this.vectorParameterList.forEach((vectorParameter) => {
                    let speedId        = vectorParameter.speed_direction[0].id,
                        directionId    = vectorParameter.speed_direction[1].id,
                        eastwardId     = vectorParameter.eastward_northward ? vectorParameter.eastward_northward[0].id : null,
                        northwardId    = vectorParameter.eastward_northward ? vectorParameter.eastward_northward[1].id : null;

                    //Update meta-data
                    metaData[speedId]     = metaData[speedId]     || metaData[eastwardId]  || metaData[northwardId] || {};
                    metaData[northwardId] = metaData[northwardId] || metaData[eastwardId]  || metaData[speedId]     || {};
                    metaData[eastwardId]  = metaData[eastwardId]  || metaData[northwardId] || metaData[speedId]     || {};
                    metaData[directionId] = metaData[directionId] || {unit: "degree"}; //Hard-coded to degree

                    $.each(dataList, function(index2, dataSet){
                        let speedValue     = dataSet[speedId],
                            directionValue = dataSet[directionId],
                            eastwardValue  = eastwardId  ? dataSet[eastwardId]  : undefined,
                            northwardValue = northwardId ? dataSet[northwardId] : undefined;

                        if ( (eastwardValue !== undefined) && (northwardValue !== undefined)){
                            if (speedValue == undefined)
                                dataSet[speedId] = Math.sqrt(eastwardValue*eastwardValue + northwardValue*northwardValue);
                            if (directionValue == undefined)
                                dataSet[directionId] = 360 * Math.atan2(eastwardValue, northwardValue) / (2*Math.PI);
                        }
                        else
                            if ((speedValue !== undefined) && (directionValue !== undefined)){
                                let directionRad = 2*Math.PI * directionValue / 360;
                                if (eastwardValue == undefined)
                                    dataSet[eastwardId]  = Math.sin(directionRad) * speedValue;
                                if (northwardValue == undefined)
                                    dataSet[northwardId] = Math.cos(directionRad) * speedValue;
                            }
                    });
                });

            //Calculate hourly min, mean, and max in forecastStatList/observationStatList = [hour: no of hours since 1-1-1970]{parameterId: {min: FLOAT, mean: FLOAT, max: FLOAT}}
            let nowHourValue = moment().valueOf()/(60*60*1000),
                statList = this[forecast ? 'forecastStatList' : 'observationStatList'] = {};

            $.each(dataList, function(index3, dataSet){
                let hourValue = Math.ceil((moment(dataSet.timestamp).valueOf()/(60*60*1000) - nowHourValue) ),
                    hourStat = statList[hourValue] = statList[hourValue] || {};
                hourStat.hour = hourValue;

                $.each(this.parameters, function(parameterId){
                    let parameterValue = dataSet[parameterId];
                    if (parameterValue !== undefined){
                        let parameterStat = hourStat[parameterId] = hourStat[parameterId] || {count: 0, min: undefined, mean: 0, max: undefined};
                        parameterStat.min = min(parameterStat.min, parameterValue);
                        parameterStat.max = max(parameterStat.max, parameterValue);
                        parameterStat.mean = (parameterStat.mean*parameterStat.count + parameterValue)/(parameterStat.count+1);
                        parameterStat.count++;
                    }
                });

            }.bind(this));
        },



        /*****************************************************
        _resolveForecast
        *****************************************************/
        _resolveForecast: function(geoJSON, groupId){
            this.forecastDataList = [];
            this._resolveGeoJSON(geoJSON, true);

            this.location.updateForecast( groupId );
        },

        /*****************************************************
        _rejectForecast
        *****************************************************/
        _rejectForecast: function(error, groupId){
            this.location.updateForecast( groupId );
        },

        /*****************************************************
        _resolveObservations
        *****************************************************/
        _resolveObservations: function(geoJSON, groupId){
            this._resolveGeoJSON(geoJSON, false);
            this.location.updateObservation( groupId );
        },

        /*****************************************************
        _rejectObservations
        *****************************************************/
        _rejectObservations: function(error, groupId){
            this.location.updateObservation( groupId );
            this.location.observationIsLoaded = false; //Force reload next time
        },
    };


}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
station.js

Station  = Single observation-station with one or more parametre.
Only one station pro Location within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};


    /****************************************************************************
    Extend Station with methods for creating and displaying a chart
    ****************************************************************************/
    $.extend(nsObservations.Station.prototype, {

        /*****************************************************
        getChartsOptions
        *****************************************************/
        getChartsOptions: function(mapOrMapId/*, inModal*/){
            let obsGroupOptions = this.observationGroup.options,

                data = this.getDefaultObsAndForecast(),
                defaultSeriesOptions = {
                    maxGap        : obsGroupOptions.maxGap,
                    directionArrow: data.isVector ? this.observationGroup.directionArrow : false
                },
                result = {
                    parameter: this.observationGroup.primaryParameter,
                    z        : this.observationGroup.z,
                    unit     : data.unit,
                    series   : [],
                    yAxis    : {
                        fixedRange    : obsGroupOptions.fixedRange,
                        semiFixedRange: obsGroupOptions.semiFixedRange,
                        minRange      : obsGroupOptions.minRange,
                        floor         : obsGroupOptions.floor,
                        min           : null
                    }
                };

                //If no fixedRange and no semiFixedRange is set and scscale not negative => set min = 0
                if (!obsGroupOptions.fixedRange && !obsGroupOptions.semiFixedRange && !data.scaleParameter.negative)
                    result.yAxis.min = 0;

                //If floor is set => remove startOnTick
                if (obsGroupOptions.floor !== undefined)
                    result.yAxis.startOnTick = false;

            //Style and data for observations
            result.series.push({
                color     : obsGroupOptions.index,
                marker    : true,
                markerSize: 2,
                visible   : this.observationGroup.isVisible(mapOrMapId),
                data      : data.obsDataList
            });


            if (this.forecast){
                //Style and data for forecast before AND after first and last observation
                result.series.push({
                    deltaColor: +2,
                    tooltipPrefix: {da:'Prognose: ', en:'Forecast: '},
                    noTooltip : false,
                    marker    : false,
                    data      : data.forecastDataListNoObs
                });

                //Style and data for forecast when there are observations
                result.series.push({
                    deltaColor: +2,
                    noTooltip : true,
                    marker    : false,
                    dashStyle : 'Dash',
                    data      : data.forecastDataListWithObs,
                    directionArrow: false
                });
            }

            $.each(result.series, function(index, options){
                result.series[index] = $.extend(true, {}, defaultSeriesOptions, options);
            });
            return result;
        }
    });



}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
42_station-table.js

Load and display time-series in a table

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};



    $.valueFormat.add({
        id     : 'NIELS',
        format : function( value/*, options */){
            let result = '';
            if (value.obs){
                result = value.obs;
                if (value.for)
                    result += '&nbsp;/&nbsp;';
            }
            if (value.for)
                result += '<em>'+value.for+'</em>';
            return result;
        }

    });


    /****************************************************************************
    Extend Station with methods for creating and displaying a table
    ****************************************************************************/
    $.extend(nsObservations.Station.prototype, {
        /*****************************************************
        getTableDataList
        Return a {timestampValue}{GROUPID:{for:STRING, obs:STRING}}
        *****************************************************/
        getTableDataList: function(){
            let groupId = this.observationGroup.id,
                data = this.getDefaultObsAndForecast(),
                result = {};

            ['obsDataList', 'forecastDataListNoObs', 'forecastDataListWithObs'].forEach( function(listName, index){
                let list = data[listName] || [],
                    isForecast = !!index;
                if (!list) return;
                list.forEach( function(singleData){
                    let timestampValue  = singleData[0],
                        timestampMoment = moment(timestampValue),
                        dataSet = this.getDataSet(timestampMoment, isForecast),
                        row = result[timestampValue] = result[timestampValue] || {timestampValue: timestampValue};

                    row[groupId] = row[groupId] || {};
                    row[groupId][isForecast ? 'for' : 'obs'] = this.formatDataSet(dataSet, isForecast);
                }.bind(this));
            }.bind(this));
            return result;
        },

        /*****************************************************
        createTable
        *****************************************************/
        createTable: function(){

        },

    });



}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, L, i18next, moment, window/*, document, undefined*/) {
	"use strict";

    let ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    //nsObservations.getMapId(mapOrMapIdap) return the unique id for the map
    nsObservations.getMapId = function(mapOrMapId){
        if (mapOrMapId)
            return typeof mapOrMapId == 'string' ? mapOrMapId : ''+mapOrMapId._leaflet_id;
        else
            return null;
    };

    //Add the color-names to the list of colors for markers and polylines
    L.BsMarker._lbmAddColorName('observations');


    /***********************************************************************************
    ************************************************************************************
    Extend FCOOObservations with methods for showing observations on a Leaflet-map
    ************************************************************************************
    ************************************************************************************/
    $.extend(ns.FCOOObservations.prototype, {
        _mapId: function(map){
            return nsObservations.getMapId(map);
        },

        /**********************************************************
        init
        **********************************************************/
        init: function( _init ){ return function(){
            _init.apply(this, arguments);

            this.maps = {};
            this.options.geoJSONOptions = this.options.geoJSONOptions || {};    //Extra options for the L.GeoJSON-layer
        }; }(ns.FCOOObservations.prototype.init),

        /**********************************************************
        onResolve
        **********************************************************/
        onResolve: function( _onResolve ){ return function(){
            _onResolve.apply(this, arguments);

            //All data are loaded => initialize all maps and update the geoJSON-data and update any layer added before the data was ready
            this._initializeMaps();
            $.each(this.maps, function(id, options){
                if (!options.dataAdded){
                    options.geoJSONLayer.addData( this._getGeoJSONData() );
                    options.dataAdded = true;
                }
            }.bind(this));
        }; }(ns.FCOOObservations.prototype.onResolve),

        /**********************************************************
        _initializeMaps(map)
        **********************************************************/
        _initializeMaps: function(map){
            let maps = map ? [{map:map}] : this.maps;

            $.each(maps, function(index, mapObj){
                let mapId = nsObservations.getMapId(mapObj.map);
                $.each(this.observationGroups, function(groupId, observationGroup){
                    let stateId = groupId+'_'+mapId,
                        show = this.state && this.state[stateId];
                    observationGroup.toggle(mapObj.map, !!show);
                }.bind(this));
            }.bind(this));
        },

        /**********************************************************
        show(groupId, mapOrMapId)
        Show ObservationGroup with id on mapOrMapId
        **********************************************************/
        show: function(groupId, mapOrMapId){
            return this.toggle(groupId, mapOrMapId, true);
        },

        /**********************************************************
        hide(groupId, mapOrMapId)
        Hide ObservationGroup with id on mapOrMapId
        **********************************************************/
        hide: function(groupId, mapOrMapId){
            return this.toggle(groupId, mapOrMapId, false);
        },

        /**********************************************************
        toggle(groupId, mapOrMapId, show)
        Toggle ObservationGroup with id on mapOrMapId
        Save new state if ObservationGroup is not jet loaded/created
        **********************************************************/
        toggle: function(groupId, mapOrMapId, show){
            let mapId = nsObservations.getMapId(mapOrMapId),
                stateId = groupId+'_'+mapId;

            this.state = this.state || {};
            this.state[stateId] = !!show;

            if (this.observationGroups[groupId])
                this.observationGroups[groupId].toggle(mapOrMapId, show);

            return this;
        },


        /**********************************************************
        openVisiblePopup(groupId, mapOrMapId)
        Open popup for all locations visible at the map
        **********************************************************/
        openVisiblePopup: function(groupId, mapOrMapId){
            if (this.observationGroups[groupId])
                this.observationGroups[groupId].openVisiblePopup(mapOrMapId);
            return this;
        },

        /**********************************************************
        closeVisiblePopup(groupId, mapOrMapId)
        Close popup for all locations visible at the map
        **********************************************************/
        closeVisiblePopup: function(groupId, mapOrMapId){
            if (this.observationGroups[groupId])
                this.observationGroups[groupId].closeVisiblePopup(mapOrMapId);
            return this;
        },

        /**********************************************************
        geoJSON return a L.geoJSON layer
        **********************************************************/
        geoJSON: function(){
            let thisOptionsGeoJSONOptions = this.options.geoJSONOptions;
            this.geoJSONOptions =
                this.geoJSONOptions ||
                $.extend(true,
                    thisOptionsGeoJSONOptions,
                    {
                        pointToLayer : function(geoJSONPoint/*, latlng*/) {
                            return geoJSONPoint.properties.createMarker(thisOptionsGeoJSONOptions);
                        },
                    }
                );

            let result = L.geoJSON(null, this.geoJSONOptions);

            result.fcooObservation = this;
            result.options.onEachFeature = $.proxy(this._geoJSON_onEachFeature, result);

            result.on({
                add   : $.proxy(this._geoJSON_onAdd,    this),
                remove: $.proxy(this._geoJSON_onRemove, this)
            });

            return result;
        },

        //_geoJSON_onEachFeature: called with this = geoJSONLayer
        _geoJSON_onEachFeature: function(feature, marker) {
            let mapId = nsObservations.getMapId(this._map),
                location = this.fcooObservation.locations[marker.options.locationId];

            location.markers[mapId] = marker;
            feature.properties.addPopup( mapId, marker );
        },

        _geoJSON_onAdd: function(event){
            let geoJSONLayer = event.target,
                map          = geoJSONLayer._map,
                mapId        = nsObservations.getMapId(map);

            this.maps[mapId] = {
                map         : map,
                $container  : $(map.getContainer()),
                geoJSONLayer: geoJSONLayer,
                dataAdded   : this.ready
            };

            if (this.ready){
                this._initializeMaps(map);
                geoJSONLayer.addData( this._getGeoJSONData() );
            }
        },

        _geoJSON_onRemove: function(event){
            //Save selected groups (this.state) and call hide for all observationGroups to close popups and clean up.
            let state = this.state;
            this.state = {};
            let mapId = nsObservations.getMapId(event.target._map);
            delete this.maps[mapId];
            $.each(this.observationGroups, function(id, observationGroup){
                observationGroup.hide(mapId);
            });
            this.state = state;
        },

        _getGeoJSONData: function(){
            if (!this.ready)
                return null;

            if (!this.geoJSONData){
                this.geoJSONData = { type: "FeatureCollection", features: []};


                //Create all locations and add them to the geoJSON-data if they are included in a observation-group
                this.locationList.forEach( function(location){
                    if (location.observationGroupList.length)
                        this.geoJSONData.features.push({
                            type      : "Feature",
                            geometry  : {type: "Point", coordinates: [location.latLng.lng, location.latLng.lat]},
                            properties: location
                        });
                }.bind(this));
            }
            return this.geoJSONData;
        }
    }); //End of extend of FCOOObservations.prototype

    /***********************************************************************************
    ************************************************************************************
    Extend ObservationGroup with methods for showing observations on a Leaflet-map
    ************************************************************************************
    ************************************************************************************/
    $.extend(nsObservations.ObservationGroup.prototype, {
        init: function( _init ){ return function(){
            _init.apply(this, arguments);

            /*
            Adjust this.options.iconOptions
            iconOptions = STRING, or
            iconOptions = {vertical: BOOLEAN, position: NUMBER (1-14) or STRING}

            The position as STING can have the following values
            BESIDE-LEFT, LEFT, CENTER, RIGHT, BESIDE-RIGHT (vertical lines), or
            AIR, SURFACE, SUBSURFACE, MIDDLE, SEAFLOOR (horizintal lines)
            */
            if (typeof this.options.iconOptions == 'string')
                this.options.iconOptions = {position: this.options.iconOptions};

            let iconOpt = this.options.iconOptions,
                pos = iconOpt.position.toUpperCase(),
                numPos = 7;

            if (typeof iconOpt.position == 'string'){
                switch (pos){
                    case 'AIR'          : numPos =  2; break;
                    case 'SURFACE'      : numPos =  5; break;
                    case 'SUBSURFACE'   : numPos =  8; break;
                    case 'MIDDLE'       : numPos = 10; break;
                    case 'SEAFLOOR'     : numPos = 12; break;

                    case 'BESIDE-LEFT'  : numPos =  2; break;
                    case 'LEFT'         : numPos =  4; break;
                    case 'CENTER'       : numPos =  7; break;
                    case 'RIGHT'        : numPos = 10; break;
                    case 'BESIDE-RIGHT' : numPos = 12; break;

                    default             : numPos =  5;
                }
                iconOpt.position = numPos;
            }

            iconOpt.vertical = ['BESIDE-LEFT', 'LEFT', 'CENTER', 'RIGHT', 'BESIDE-RIGHT'].includes(pos);

            //Create faIconPopup:[STRING]= icon in eq. bsModal or popups
            this.faIconPopup = L.bsMarkerAsIcon('observations', null, false );

            //Create faIcon:[STRING]: A extended icon similar to the icon used as marker
            this.faIcon = L.bsMarkerAsIcon('observations', null, false );

            //Remove the frame icon temporally
            let frameIcon = this.faIcon[0].pop();

            //Add a darker color representing the ground or sea
            this.faIcon[0].push('fa-obs-line fa-obs-line-horizontal fa-obs-line-surface');

            this.faIcon[0].push('fa-obs-line fa-obs-line-'+(iconOpt.vertical ? 'vertical' : 'horizontal') + ' fa-obs-line-pos-'+numPos + (iconOpt.length ? ' fa-obs-line-'+iconOpt.length : ''));

            //Add the frame icon again and makes it on top
            this.faIcon[0].push(frameIcon + '  position-relative');

            this.faIconClass = 'obs-group-icon-container';

            //Copy icon-info into standard options
            this.options.icon = this.faIcon;
            this.options.iconClass = this.faIconClass;

        }; }(nsObservations.ObservationGroup.prototype.init),

    });

    /***********************************************************************************
    ************************************************************************************
    Extend Location with methods for showing observations on a Leaflet-map
    ************************************************************************************
    ************************************************************************************/
    const bsMarkerOptions = {
            size     : 16, //Changed from 'small' to have same size as icon
            colorName: 'observations',
            round    : false,

            markerClassName  : 'overflow-hidden',
            thinBorder       : true,
            individualContent: true,

            transparent: true,

            hover      : true,
            tooltipPermanent: false,

            /* Do not work:
            direction: 'top',
            position: 'top',
            tooltipDirection: 'top',
            tooltipPosition: 'top',
            */
            tooltipHideWhenPopupOpen: true
        };

    nsObservations.toChar = '&nbsp;/&nbsp;'; //'&#9656;'; //Same as in fcoo-jquery-bootstrap-highcharts/src/time-series.js

    function getMapIdFromPopupEvent( popupEventOrMapId ){
        return typeof popupEventOrMapId == 'string' ? popupEventOrMapId : nsObservations.getMapId(popupEventOrMapId.target._map);
    }

    //Sets the methods for different func-lists
    nsObservations.updateLastObservationFuncList.push('updateLastObservation_in_modal');
    nsObservations.updateObservationFuncList.push('updateObservation_in_modal');
    nsObservations.updateForecastFuncList.push('updateForecast_in_modal');

    $.extend(nsObservations.Location.prototype, {
        /*********************************************
        init
        *********************************************/
        init: function( _init ){ return function(){
            _init.apply(this, arguments);

            this.latLng = this.options.position ? L.latLng( this.options.position ) : null;

            /*
            modalElements = {
                map-id: {
                    observationGroup-id: {
                        $lastObservation      : []$-element   //Set of $-elements containing the last measured value
                        $observationStatistics: []$-element   //Set of $-elements containing the statistics for previous observations for eg. 6h, 12h, and 24h = nsObservations.observationPeriods
                        $forecastStatistics   : []$-element   //Set of $-elements containing the forecast statistics for eg. 6h, 12h, and 24h = nsObservations.forecastPeriods
                    }
                }
            }
            There is a {$lastObservation, $observationStatistics, $forecastStatistics} with $-elements for each map and each observation-group
            */

            this.markers = {};
            this.modalElements = {};

            this.popups = {};

            this.openPopupAsNormal = true;

        }; }(nsObservations.Location.prototype.init),

        /*********************************************
        isVisible(mapId) - return true if the location is shown on the map (mapId)
        *********************************************/
        isVisible: function(mapId){
            let result = false;
            $.each(this.observationGroups, function(id, observationGroup){
                if (observationGroup.isVisible(mapId))
                    result = true;
            });
            return result;
        },

        /*********************************************
        isShownInModal() - return true if the location has any data (observation and/or forecast) shown in any modal (eg. popup)
        *********************************************/
        isShownInModal: function(){
            let result = false;

            $.each(this.modalElements, function(mapId, obsGroups){
                $.each(obsGroups, function(obsGroupId, elementGroups){
                    $.each(elementGroups, function($elementGroupId, elementList){
                        if (elementList && elementList.length)
                            result = true;
                    });
                });
            });
            return result;
        },

        /*********************************************
        getHeader
        *********************************************/
        getHeader: function(){
            return {
                icon: this.observationGroupList[0].faIconPopup,
                text: this.name
            };
        },

        /*********************************************
        createSVG
        *********************************************/
        createSVG: function(svgOptions){
            let _this = svgOptions.marker.options._this,
                dim   = svgOptions.width + 2; //svgOptions.width is inner-width

            svgOptions.draw.attr({'shape-rendering': "crispEdges"});

            //Draw darker background to represent below surface
            svgOptions.draw.line(0, 10, 16, 10).stroke({color: '#cd9c0f', width: 9});   //Color = hard copy from css for .fa-obs-line-surface

            $.each(_this.observationGroupList, function(index, observationGroup){
                /*
                For each observationGroup the location is part of => draw a vertical or horizontal line
                iconOpt = {
                    vertical: [BOOLEAN]
                    position: NUMBER Between 1 and 14
                    vertical: BOOLEAN
                    length  : STRING, "1-2", 2-2", "1-3", "2-3", or "3-3"
                */

                let iconOpt  = observationGroup.options.iconOptions,
                    pos      = iconOpt.position,
                    lgd      = iconOpt.length,
                    vertical = iconOpt.vertical,
                    start    = 0,
                    end      = dim;

                if (lgd)
                    switch (lgd){
                        case '1-2':                                 end = (dim / 2)  - 1;           break;
                        case '2-2': start = (dim/2)  - 1;                                           break;
                        case '1-3':                                 end = Math.floor(dim / 3);      break;
                        case '2-3': start = Math.floor(dim/3)-1;    end = Math.floor(2 * dim / 3);  break;
                        case '3-3': start = Math.floor(2*dim/3)-1;                                  break;
                    }

                svgOptions.draw
                    .line(
                        vertical ? pos   : start,
                        vertical ? start : pos,
                        vertical ? pos   : end,
                        vertical ? end   : pos
                    )
                    .stroke({
                        color: svgOptions.borderColor,
                        width: 2
                    })
                    .addClass('obs-group-marker-'+observationGroup.options.index);
            });
        },

        /*********************************************
        createMarker
        *********************************************/
        createMarker: function(options){
            let markerOptions = $.extend(true, {}, bsMarkerOptions, options || {});
            markerOptions.locationId = this.id;
            markerOptions._this = this;
            markerOptions.svg = this.createSVG;


            $.each(this.observationGroupList, function(index, observationGroup){
                markerOptions.markerClassName += ' obs-group-marker-' + observationGroup.options.index;
            });
            markerOptions.tooltip = {text: this.name};

            return L.bsMarkerSimpleSquare( this.latLng, markerOptions);
        },

        /*********************************************
        _updateAny$elemetList
        Update all $-elements in the list of $-elements
        *********************************************/
        _updateAny$elemetList: function(listId, valueFunc/*=function(station)*/, onlyGroupId){
            $.each(this.observationGroupStations, function(observationGroupId, station){
                if (!onlyGroupId || (onlyGroupId == observationGroupId))
                    $.each(this.modalElements, function(mapId, obsGroups){
                        let elements = obsGroups[observationGroupId];
                        if (elements)
                            $.each(elements[listId] || [], function(index, $element){
                                $element.html(valueFunc(station, index));
                            });
                    });
            }.bind(this));
            return this;
        },

        /*********************************************
        updateLastObservation_in_modal
        Update all $-elements in with latest value for observations
        modalElements[mapId][observationGroupId].$lastObservation: []$-element set of $-elements
        containing the last measured value. There is a []$-element for each map and each observation-group
        *********************************************/
        updateLastObservation_in_modal: function(){
            //If not displayed in any modal  => exit
            if (!this.isShownInModal())
                return;

            this._updateAny$elemetList(
                '$lastObservation',
                function(station){
                    let dataSet = station.getDataSet(true, false); //Last observation

                    //If the timestamp is to old => return '?'
                    return station.datasetIsRealTime(dataSet) ? station.formatDataSet(dataSet, false) : '?';
                }
            );
        },

        /*********************************************
        updateObservation_in_modal
        Update all $-elements in with latest value and stat (min, mean, max) for observations
        modalElements[mapId][observationGroupId].$lastObservation: []$-element set of $-elements
        containing the last measured value. There is a []$-element for each map and each observation-group
        *********************************************/
        updateObservation_in_modal: function( onlyGroupId ){
            //If not shown in modal => exit
            if (!this.isShownInModal())
                return;

            //Update stat for previous observations
            this._updateAny$elemetList(
                '$observationStatistics',
                function(station, index){
                    return station.formatPeriodStat(index, false);
                },
                onlyGroupId
            );
        },


        /*********************************************
        updateForecast_in_modal
        Update all $-elements in with stat (min, mean, max) for forecast
        modalElements[mapId][observationGroupId].$forecastStatistics: []$-element.
            One $-element for each interval defined by nsObservations.forecastPeriods
        *********************************************/
        updateForecast_in_modal: function( onlyGroupId ){
            //If not shown in modal => exit
            if (!this.isShownInModal())
                return;

            this._updateAny$elemetList(
                '$forecastStatistics',
                function(station, index){
                    return station.formatPeriodStat(index, true);
                },
                onlyGroupId
            );
        },


        /*********************************************
        addPopup
        *********************************************/
        addPopup: function(mapId, marker){
            let scrollContent = this.observationGroupList.length > 2;

            marker.bindPopup({
                width  : 258, //265,

                fixable: true,
                //scroll : 'horizontal',

                //noVerticalPadding:  true,
                //noHorizontalPadding: true,

                header : this.getHeader(),

                isMinimized: true,
                minimized  : {
                    showTooltip: true,
                    width    : 101, //96,
                    className: 'text-center latest-observation-body',

                    //showHeaderOnClick: true,
                    onResize      : this.onMimimizedResize,
                    content       : this.createMinimizedPopupContent,
                    contentContext: this,
                    dynamic       : true,
                },

                content       : this.createNormalPopupContent,
                contentContext: this,
                dynamic       : true,
                scroll        : scrollContent,
                maxHeight     : scrollContent ? 400 : null,
                buttons: [{
                    id     : 'mini',
                    icon   : 'far fa-message-middle',
                    text   : {da: 'Vis', en: 'Show'},
                    title  : {da: 'Vis seneste måling', en: 'Show latest measurement'},
                    class  : 'min-width',
                    context: this,
                    //onClick: function(){ this.popupMinimized( mapId ); }
                    onClick: this.popupMinimized.bind(this, mapId)

                },{
                    id      : 'extend',
                    //icon    : ['fa-chart-line', 'fa-table'],
                    //text    : {da:'Graf og tabel', en:'Chart and Table'},
                    icon    : 'far fa-chart-line',
                    _text    : {da:'Vis graf', en:'Show Chart'},
                    text    : {da:'Graf', en:'Chart'},

                    onClick : this.showCharts.bind(this, mapId),
/*
                    onClick : function(){
                        $.bsModal({
                            header: this.getHeader.bind(this),
                            flexWidth: true,
                            megaWidth: true,
                            content: this.createCharts.bind(this, $body, true, mapId)
                            remove: true,
                            show: true
                        });
                        marker._popup.setSizeExtended();
                    }.bind(this)
*/
                }, window.INCLUDETABLESINMODAL ? {
                    id     : 'table',
                    icon   : 'far fa-table',
                    _text   : {da:'Vis tabel', en:'Show Table'},
                    text   : {da:'Tabel', en:'Table'},

                    //onClick: function(){ this.showTables(mapId); }.bind(this),
                    onClick: this.showTables.bind(this, mapId),
                } : undefined],
                footer: {da:'Format: Min'+nsObservations.toChar+'Maks (Middel)', en:'Format: Min'+nsObservations.toChar+'Max (Mean)'},

                //isExtended: true,
                NOT_NOW_extended: {
                    noVerticalPadding  :  true,
                    noHorizontalPadding: true,

                    width  :      nsObservations.imgWidth,
                    //height : 30 + 2*nsObservations.imgHeight,

                    content       : this.createExtendedPopupContent,
                    contentContext: this,
                    dynamic       : true,

                    _buttons: false,
                    _footer : false,
                },

            });
            marker.on('popupopen',  this.popupOpen,  this );
            marker.on('popupclose', this.popupClose, this );
        },

        /*********************************************
        popupOpen
        *********************************************/
        popupOpen: function( popupEvent ){
            let mapId = nsObservations.getMapId(popupEvent.target._map);
            this.popups[mapId] = popupEvent.popup;

            if (this.openPopupAsNormal)
                popupEvent.popup.setSizeNormal();
        },

        /*********************************************
        popupClose
        *********************************************/
        popupClose: function( popupEventOrMapId ){
            let mapId = getMapIdFromPopupEvent(popupEventOrMapId);
            delete this.modalElements[mapId];
            delete this.popups[mapId];
        },


        /*********************************************
        popupMinimized
        Minimize and pin popup
        *********************************************/
        popupMinimized: function( popupEventOrMapId ){
            let mapId = getMapIdFromPopupEvent(popupEventOrMapId),
                marker = this.markers[mapId];

            if (!marker) return this;

            if (marker.isPopupOpen())
                marker.getPopup()
                    .setSizeMinimized()
                    ._setPinned(true);
            else {
                this.openPopupAsNormal = false;
                this.markers[mapId].openPopup();
                this.popups[mapId]._setPinned(true);
                this.openPopupAsNormal = true;
            }
            return this;
        },

        /*********************************************
        _getModalElements
        *********************************************/
        _getModalElements: function(mapId){
            let mapElements = this.modalElements[mapId] = this.modalElements[mapId] || {};
            $.each(this.observationGroupStations, function(observationGroupId){
                mapElements[observationGroupId] = mapElements[observationGroupId] || {
                    $lastObservation      : [],
                    $observationStatistics: [],
                    $forecastStatistics   : []
                };
            });
            return mapElements;
        },

        /*********************************************
        onMimimizedResize
        Called when the content of a minimized popup is changed
        *********************************************/
        onMimimizedResize: function( size, popup, $body, options, map ){
            const isMultiObsGroup = $(map.getContainer()).hasClass('multi-obs-group');

            let fontSize       = parseFloat($body.css('font-size'   )),
                padding        = parseFloat($body.css('padding-left')),
                innerTextWidth = 1.5*fontSize;

            if (isMultiObsGroup){
                let textList = []; //List of shortNames of displayed parameters
                this.observationGroupList.forEach( observationGroup => {
                    if (observationGroup.isVisible(map))
                        textList.push( i18next.sentence(observationGroup.shortName) );
                });
                innerTextWidth = Math.ceil($.getTextWidth(textList, fontSize));
            }
            else {
                //Only one group visible on the map => Only value is displayed in popup => Find the <span> with the last measurement and use its width
                let visibleObsGroupIndex = -1;
                this.observationGroupList.forEach( observationGroup => {
                    if (observationGroup.isVisible(map))
                        visibleObsGroupIndex = observationGroup.options.index;
                });

                const elem = $body.find('.latest-observation.show-for-obs-group-'+visibleObsGroupIndex+' .the-value');
                if (elem)
                    innerTextWidth = Math.max(innerTextWidth, $(elem).innerWidth());
            }
            popup.setWidth({minimized: 1 + padding + innerTextWidth + padding + 1} );
        },

        /*********************************************
        createMinimizedPopupContent
        = list of parameter-name, last value
        *********************************************/
        createMinimizedPopupContent: function( $body, popup, map ){
            let mapElements = this._getModalElements( nsObservations.getMapId(map) );
            $.each(this.observationGroups, function(id, observationGroup){
                let $lastObservation = mapElements[id].$lastObservation;

                //Content for minimized mode
                let $div =
                    $('<div/>')
                        .addClass('latest-observation text-center no-border-border-when-last-visible show-for-obs-group-'+observationGroup.options.index)
                        ._bsAddHtml({text: observationGroup.shortName, textClass:'obs-group-header show-for-multi-obs-group fa-no-margin text-nowrap d-block'})
                        ._bsAddHtml({text: ' ', textStyle: 'bold', textClass:'the-value text-nowrap'}),
                    $elem = $div.find('span:last-child');

                $elem._bsAddHtml({icon: ns.icons.working}),

                $lastObservation.push($elem);

                $body.append($div);
            });

            this.updateLastObservation();
        },

        /*********************************************
        createNormalPopupContent
        = table with previous measurments, list of last observation(s)  and table with forecast statistics
        *********************************************/
        createNormalPopupContent: function( $body, popup, map ){
            let mapElements    = this._getModalElements( nsObservations.getMapId(map) ),
                //tempClassName  = ['TEMP_CLASS_NAME_0', 'TEMP_CLASS_NAME_1', 'TEMP_CLASS_NAME_2'],
                hasAnyForecast = false;

            /*Create content in tree tables:
                1: $table_prevObservation = Stat for previous measurements
                2: $table_lastObservation = Latest measurement(s)
                3: $table_forecast        = Stat for forecasts
            */
            let $table_prevObservation = $('<table/>').addClass('obs-statistics prev text-center'),
                $table_lastObservation = $('<table/>').addClass('last-observation text-center'),
                $table_forecast        = $('<table/>').addClass('obs-statistics forecast text-center');

                //Add header to previous observation and forecast
                let $tr = $('<tr/>').appendTo($table_prevObservation);
                $.each(nsObservations.observationPeriods, function(index, hours){
                    $('<td></td>')
                        .addClass('value')
                        .i18n({da:'Seneste '+hours+'t', en:'Prev. '+hours+'h'})
                        .appendTo($tr);
                });

                $tr = $('<tr/>').appendTo($table_forecast);
                $.each(nsObservations.forecastPeriods, function(index, hours){
                    $('<td></td>')
                        .addClass('value')
                        .i18n({da:'Næste '+hours+'t', en:'Next '+hours+'h'})
                        .appendTo($tr);
                });

            $.each(this.observationGroupList, function(index, observationGroup){
                let groupElements = mapElements[observationGroup.id];

                //Add the group-name as a header but only visible when there is only one group visible
                $body._bsAppendContent({
                    type  : 'textbox',
                    text  : observationGroup.header,
                    center: true,
                    class : 'obs-group-header show-for-single-obs-group show-for-obs-group-'+observationGroup.options.index
                });

                //Check if any stations have forecast
                let hasForecast = this.observationGroupStations[observationGroup.id].forecast;
                if (hasForecast)
                    hasAnyForecast = true;

                /******************************************
                Last observation
                *******************************************/
                let $tr = $('<tr/>')
                            .addClass('show-for-obs-group-'+observationGroup.options.index)
                            .appendTo($table_lastObservation);
                $('<td/>')
                    .addClass('obs-group-header show-for-multi-obs-group')
                    ._bsAddHtml({text: observationGroup.name})
                    .appendTo($tr);

                let $td = $('<td/>')
                    .addClass('fw-bold _time-now-color _time-now-text-color')
                    .appendTo($tr);

                groupElements.$lastObservation.push($td);


                /******************************************
                Statistics for previous observations and forecast
                ******************************************/
                //Row with observation group name
                $tr = $('<tr/>')
                        .addClass('obs-group-header show-for-multi-obs-group')
                        .addClass('show-for-obs-group-'+observationGroup.options.index)
                        .append(
                            $('<td colspan="'+nsObservations.forecastPeriods.length+'"/>')._bsAddHtml({text: observationGroup.header})
                        );
                $tr.appendTo($table_forecast);
                $tr.clone().appendTo($table_prevObservation);


                function appendValueTd($tr, withSpinner){
                    let $span =
                            $('<span/>')
                                .addClass('value')
                                .html(withSpinner ? '<i class="'+ns.icons.working+'"/>' : '&nbsp;');
                    $('<td/>')
                        .addClass('value')
                        .append($span)
                        .appendTo($tr);
                    return $span;
                }

                //Create table with stat for previous observations and stat for forecast
                let $tr_prevObservation = $('<tr/>')
                        .addClass('fw-bold no-border-border-when-last-visible show-for-obs-group-'+observationGroup.options.index)
                        .appendTo($table_prevObservation),
                    $tr_forecast = $tr_prevObservation.clone().appendTo($table_forecast),
                    i;

                for (i=0; i<nsObservations.observationPeriods.length; i++)
                    groupElements.$observationStatistics.push( appendValueTd($tr_prevObservation, i==1));

                if (hasForecast)
                    for (i=0; i<nsObservations.forecastPeriods.length; i++)
                        groupElements.$forecastStatistics.push( appendValueTd($tr_forecast, i==1));
                else
                    $('<td colspan="'+nsObservations.forecastPeriods.length+'"/>')
                        ._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
                        .appendTo($tr_forecast);
            }.bind(this));

            //Load observation
            this.loadObservation();

            //Load forecast (if any)
            this.loadForecast();


            $body._bsAppendContent({
                type     : 'accordion',
                //neverClose: true,
                multiOpen: true,
                allOpen  : true,
                children : [{
                    header              : {icon:'far fa-right-from-line fa-flip-horizontal', text: {da:'Forrige målinger ', en:'Previous Measurements'}},
                    className           : 'accordion-prev-observation',
                    noHorizontalPadding : true,
                    noVerticalPadding   : true,
                    content             : $table_prevObservation
                },{
                    header              : {icon:'fa-equals fa-rotate-90', text: {da:'Seneste måling', en:'Latest Measurement'}},
                    className           : 'accordion-last-observation',
                    noHorizontalPadding : true,
                    content             : $table_lastObservation
                },{
                    header              : {icon:'far fa-right-from-line', text: {da:'Prognoser', en:'Forecasts'}},
                    className           : 'accordion-forecast',
                    noHorizontalPadding : true,
                    content             : hasAnyForecast ? $table_forecast : $('<span/>')._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
                }]
            });


/*
            //Append tree texboxes with the tree tables
            $body._bsAppendContent([
                {type: 'textbox', label: {da:'Forrige målinger ', en:'Previous Measurements'}, icon: ns.icons.working, iconClass: tempClassName[0], center: true},
                {type: 'textbox', label: {da:'Seneste måling',    en:'Latest Measurement'},    icon: ns.icons.working, iconClass: tempClassName[1], center: true, darkBorderlabel: true},
                {type: 'textbox', label: {da:'Prognoser',         en:'Forecasts'},             icon: ns.icons.working, iconClass: tempClassName[2], center: true}
            ]);

            //Insert $table_XX instead of span or remove it
            [
                $table_prevObservation,
                $table_lastObservation,
                hasAnyForecast ? $table_forecast : $('<span/>')._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
            ].forEach( ($element, index) => {
                let $span = $body.find('.'+tempClassName[index]),
                    $container = $span.parent();

                $container.empty();
                $container.append($element);
            });
*/

        },

        /*********************************************
        createExtendedPopupContent
        = table with all observations + forecast and chart
        *********************************************/
        createExtendedPopupContent: function( $body ){

            this.createCharts($body, false );

        }

    });

}(jQuery, L, this.i18next, this.moment, this, document));


