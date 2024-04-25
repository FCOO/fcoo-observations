/****************************************************************************
location.js

Location = group of Stations with the same or different paramtre

****************************************************************************/
(function ($, i18next, moment, window, document, undefined) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/

    /*
    To allow different "systems" using the same FCOOObservations
    there are four global lists of "functions" under nsObservations that are being used:

    isActiveFuncList
    updateLastObservationFuncList
    updateObservationFuncList
    updateForecastFuncList

    The four list contains of
        1: Function, or
        2: {func: Function or String (method-name for context), context: Object (default = this (Location))}, or
        3: String (method-name for Location) => 2:
    */

    nsObservations.isActiveFuncList = [];
    nsObservations.updateLastObservationFuncList  = [];
    nsObservations.updateObservationFuncList  = [];
    nsObservations.updateForecastFuncList  = [];

    nsObservations.imgWidth  = 500; //250; //600;
    nsObservations.imgHeight = 340; //Original = 400;

    nsObservations.Location = function(options){
        options = this.options = $.extend(true, {}, {active: true}, options);

        this.id = options.id;
        this.active = options.active;

        this.name = ns.ajdustLangName(options.name);

        this.stationList = [];
        this.stations = {};

        //observationGroups and observationGroupList = the gropup this location belongs to
        this.observationGroups = {};
        this.observationGroupList = [];

        //observationGroupStations = {observationGroup-id: Station} = ref to the active/prioritized Station (if any) used for the ObservationGroup
        this.observationGroupStations = {};
        this.observationGroupStationList = [];

        this.init();
    };


    nsObservations.Location.prototype = {

        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
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
//console.log(svgOptions);
            var _this = svgOptions.marker.options._this,
                dim   = svgOptions.width,
                dim2  = Math.floor( dim / 2),
                dim3  = Math.floor( dim / 3),
                dim4  = Math.floor( dim / 4),
                iconOptions, pos;
//console.log(dim, dim2, dim3, dim4);
            svgOptions.draw.attr({'shape-rendering': "crispEdges"});

            $.each(_this.observationGroupList, function(index, observationGroup){
                /*
                For each observationGroup the location is part of => draw a vertical or horizontal line
                iconOptions = {
                    vertical: [BOOLEAN]
                    position: vertical = true : 'left', 'beside-left', 'middle', 'beside-right', or 'right'
                              vertical = false: 'top', ' over',        'center', 'below',        or 'bottom'
                */
//['left', 'beside-left', 'middle', 'beside-right', 'right'].forEach( (pos) => {

                iconOptions = observationGroup.options.iconOptions;
//                iconOptions = {position: pos, vertical: observationGroup.options.iconOptions.vertical};

                switch (iconOptions.position){
                    case 'left'         : case 'top'   :  pos = dim4;        break;
                    case 'beside-left'  : case 'over'  :  pos = dim3;        break;
                    case 'middle'       : case 'center':  pos = dim2;        break;
                    case 'beside-right' : case 'below' :  pos = dim2 + dim4; break;
                    case 'right'        : case 'bottom':  pos = dim2 + dim3; break;
                    default                            :  pos = dim2;
                }

                svgOptions.draw
                    .line(
                        iconOptions.vertical ? pos : 0,
                        iconOptions.vertical ? 0   : pos,
                        iconOptions.vertical ? pos : dim,
                        iconOptions.vertical ? dim : pos
                    )
                    .stroke({
                        color: svgOptions.borderColor,
                        width: 1
                    })
                    .addClass('obs-group-marker-'+observationGroup.options.index);
/*
if (!iconOptions.vertical)
                svgOptions.draw
                    .line(0, pos+1,  dim, pos+1)
                    .stroke({
                        color: '#FF0000',
                        width: 1
                    })
                    .addClass('obs-group-marker-'+observationGroup.options.index);
*/
//});










            });
        },

        /*********************************************
        appendStations
        *********************************************/
        appendStations: function( locationOptions, defaultStationOptions ){
            var _this = this,
                opt = locationOptions;

            //Create default station-options from location and default options
            defaultStationOptions =
                $.extend(true, {}, defaultStationOptions, {
                    level       : opt.level     || undefined,
                    refLevel    : opt.refLevel  || undefined,
                    owner       : opt.owner     || undefined,
                    provider    : opt.provider  || undefined,
                    position    : opt.position  || undefined,
                    parameter   : opt.parameter || opt.parameterList || undefined
                });

            /*  Append the station(s) related to the location.
                There are different ways to set stations:
                1: A single station can be defined using attributes:
                station or stationId: STRING = The station id
                owner    : STRING (optional)
                provider : STRING (optional)
                parameter or parameterList: NxSTRING (optional) or PARAMETER or []PARAMETER

                2: A list of station-records or station-id:
                station or stationList: []STRING or []STATION
            */

            var stationList = opt.station || opt.stationId || opt.stationList;

            delete opt.station;
            delete opt.stationId;
            delete opt.stationList;

            if (typeof stationList == 'string')
                stationList = stationList.split(' ');
            stationList = $.isArray(stationList) ? stationList : [stationList];

            var hasActiveStation = false;
            $.each(stationList, function(index, stationOptions){
                if (typeof stationOptions == 'string')
                    stationOptions = {id: stationOptions};

                stationOptions = $.extend(true, {}, defaultStationOptions, opt, stationOptions );
                stationOptions.parameter = stationOptions.parameter || stationOptions.parameterList;
                var newStation = new nsObservations.Station( $.extend(true, {}, defaultStationOptions, stationOptions ), _this );

                if (newStation.options.active)
                    hasActiveStation = true;
                _this.stationList.push(newStation);
                _this.stations[newStation.id] = newStation;
            });

            if (this.active && !hasActiveStation)
                this.active = false;
        },


        /*********************************************
        _finally - Called when all meta-data is loaded
        *********************************************/
        _finally: function(){
            var _this = this,
                wasActive = this.active;

            this.active = false;

            //For each ObservationGroup: Find the active station = The Station with options.prioritized = true OR the first "active" Station in the list (options.active = true)
            $.each(this.observationGroups, function(observationGroupId, observationGroup){
                var activeStation = null;
                $.each(_this.stationList, function(index, station){
                    if (station.options.active)
                        $.each(station.parameters, function(parameterId){
                            if (parameterId == observationGroup.primaryParameter.id)
                                //The station is active and have parameter from observationGroup. If it is prioritized or the first station
                                activeStation = station.options.prioritized ? station : (activeStation || station);
                        });
                });

                if (activeStation){
                    _this.active = wasActive;
                    _this.observationGroupStations[observationGroupId] = activeStation;
                    _this.observationGroupStationList.push(activeStation);

                    activeStation.addToObservationGroup(observationGroup);
                }
            });
        },


        /*****************************************************
        loadObservation
        Load observation for all stations and parameter (if any) and update observationDataList and call location.updateObservation()
        NOTE: The data is only loaded ONCE since loading last observation will update observationDataList
        *****************************************************/
        loadObservation: function(){
            var _this = this;
            if (this.observationIsLoaded)
                this.updateObservation();
            else {
                var resolve = $.proxy(this._resolveObservation, this),
                    promiseList = [];

                this.observationPromiseIndex = [];
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    $.each(station.observation, function(parameterId, fileName){
                        _this.observationPromiseIndex.push(station);
                        promiseList.push(
                            window.Promise.getJSON(
                                ns.dataFilePath(fileName),
                                {noCache: true, useDefaultErrorHandler: false}
                            )
                        );
                    });
                });

                window.Promise.each(promiseList, resolve)
                    .then( $.proxy(this.updateObservation, this) );

                this.observationIsLoaded = true;
            }
        },

        /*****************************************************
        _resolveObservation - resole observation pro station
        *****************************************************/
        _resolveObservation: function(data, promiseIndex){
            this.observationPromiseIndex[promiseIndex]._resolveObservations(data);
        },


        /*****************************************************
        _getFuncList - Get an adjusted version of one of the function-lists:
        isActiveFuncList, updateLastObservationFuncList, updateObservationFuncList, updateForecastFuncList
        *****************************************************/
        _getFuncList: function( listOrListName ){
            let _this = this,
                list = typeof listOrListName == 'string' ? nsObservations[listOrListName] : listOrListName,
                result = [];
            list.forEach( (opt) => {
                let func;
                if (typeof opt == 'string')
                    func = _this[opt].bind(_this);
                else
                    if (typeof opt == 'function')
                        func = opt.bind(_this);
                    else {
                        let method = opt.func,
                            context = opt.context || _this;
                        func = (typeof method == 'string' ? context[method] : method).bind(context);
                    }
                result.push(func);
            });
            return result;
        },


        /*****************************************************
        isActive - Return true if any of the 'user' is active for the location
        That means if any given methods in isActiveFuncList return true
        *****************************************************/
        isActive: function(){
            let result = false;

            this._getFuncList('isActiveFuncList').forEach( (func) => {
                result = result || func();
            });
            return result;
        },


        /*****************************************************
        loadForecast
        Load forecast for all stations and parameter (if any) and update forecastDataList and call location.updateForecast()
        The load is controlled by a 'dummy' Interval that check if new data are needed
        *****************************************************/
        loadForecast: function(){
            if (this.forecastIsLoaded)
                this.updateForecast();
            else
                if (this.interval)
                    this._loadForecast();
                else
                    this.interval = window.intervals.addInterval({
                        data    : {},
                        duration: 60, //Reload every 60 min
                        resolve : $.proxy(this._loadForecast, this),
                        wait    : false
                    });
        },

        _loadForecast: function(){
            var _this = this;
            //If the location of the station has any data displayed at any 'user' => load
            if (this.isActive()){
                var resolve = $.proxy(this._resolveForecast, this),
                    promiseList = [];

                this.forecastPromiseIndex = [];
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    $.each(station.forecast, function(parameterId, fileName){
                        _this.forecastPromiseIndex.push(station);
                        promiseList.push(
                            window.Promise.getJSON(
                                ns.dataFilePath(fileName),
                                {noCache: true, useDefaultErrorHandler: false}
                            )
                        );
                    });
                });

                window.Promise.each(promiseList, resolve)
                    .then( $.proxy(this.updateForecast, this) );

                this.forecastIsLoaded = true;
            }
            else
                this.forecastIsLoaded = false;
        },

        /*****************************************************
        _resolveForecast - resole forecast pro station
        *****************************************************/
        _resolveForecast: function(data, promiseIndex){
            this.forecastPromiseIndex[promiseIndex]._resolveForecast(data);
        },


        /*********************************************
        updateLastObservation
        If any of the user is using this location =>
        call all the update-methods from updateLastObservationFuncList
        *********************************************/
        updateLastObservation: function(){
            if (this.isActive())
                this._getFuncList('updateLastObservationFuncList').forEach( (func) => {
                    func();
                });

            return this;
        },

        /*********************************************
        updateObservation
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateObservationFuncList
        *********************************************/
        updateObservation: function(){
            //If not active by any user => exit
            if (!this.isActive())
                return;

            //Update last observation
            this.updateLastObservation();

            //Call all the update-methods from updateObservationFuncList
            this._getFuncList('updateObservationFuncList').forEach( (func) => {
                func();
            });

            return this;
        },

        /*********************************************
        updateForecast
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateForecastFuncList
        *********************************************/
        updateForecast: function(){
            if (this.isActive())
                this._getFuncList('updateForecastFuncList').forEach( (func) => {
                    func();
                });

            return this;
        },
    };

}(jQuery, this.i18next, this.moment, this, document));



