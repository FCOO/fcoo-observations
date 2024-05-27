/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
	"use strict";

    var ns = window.fcoo = window.fcoo || {},
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


    nsObservations.getFCOOObservations = function(resolve, options){
        if (ns.fcooObservations && ns.fcooObservations.loaded){
            resolve(ns.fcooObservations);
            return;
        }

        ns.fcooObservations = ns.fcooObservations || new ns.FCOOObservations(options);
        ns.fcooObservations.resolvelist.push(resolve);
    };





    /***************************************************************
    FCOOObservations
    ****************************************************************/
    ns.FCOOObservations = function(options = {}){
        var _this = this;
        this.options = $.extend(true, {}, {
			VERSION         : "{VERSION}",
            subDir          : {
                observations: 'observations',
                forecasts   : 'forecasts'
            },
            groupFileName           : 'observations-groups.json',
            locationFileName        : 'locations.json',
        }, options);

        this.resolvelist = [];

        this.init();

        this.ready = false;
        this.loaded = false;

        //Read observations-groups
        this.observationGroupList = [];
        this.observationGroups = {};

        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.groupFileName}),
            resolve : function(data){
                data.groupList.forEach( (options) => {
                    if (!options.inactive){
                        options.index = _this.observationGroupList.length;
                        var newObservationGroup = new nsObservations.ObservationGroup(options, _this);
                        _this.observationGroupList.push(newObservationGroup);
                        _this.observationGroups[newObservationGroup.id] = newObservationGroup;
                    }
                });
            }
        });


        //Read locations
        this.locations = {};
        this.locationList = [];
        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.locationFileName}),
            resolve : function(data){
                $.each(data, function(index, options){
                    var newLocation = new nsObservations.Location(options);
                    newLocation.observations = _this;
                    _this.locationList.push(newLocation);
                    _this.locations[newLocation.id] = newLocation;
                });
                _this._promise_setup();
            },
        });
    };

    ns.FCOOObservations.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        _promise_setup: function(){
            //Reads the files with the setup for the meassurements stations
            this.fileNameList = this.options.fileName;
            //If no fileName are given in options => use the file names given in each observation-group
            if (this.fileNameList){
                if (typeof this.fileNameList == 'string')
                    this.fileNameList = this.fileNameList.split(' ');
                else
                    this.fileNameList = $.isArray(this.options.fileName) ? this.options.fileName : [this.options.fileName];
            }
            else  {
                this.fileNameList = [];
                this.observationGroupList.forEach( obsGroup => {
                    if (obsGroup.options.fileName)
                        this.fileNameList.push(obsGroup.options.fileName);
                }, this);
            }
            this.filesResolved = 0;

            this.fileNameList.forEach(fileName => {
                ns.promiseList.append({
                    fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: fileName}),
                    resolve : this._resolve_setup.bind(this)
                });
            }, this);


            //Read last measurement every 3 min. Start after station-lists are loaded
            //Only in test-mode: window.intervals.options.durationUnit = 'seconds';
            let _this = this,
                fileNameList = [];
            if (this.options.lastObservationFileName)
                fileNameList = $.isArray(_this.options.lastObservationFileName) ? _this.options.lastObservationFileName : _this.options.lastObservationFileName.split(' ');
            else
                this.observationGroupList.forEach( obsGroup => {
                    if (obsGroup.options.lastObservationFileName)
                        this.fileNameList.push(obsGroup.options.lastObservationFileName);
                });

            ns.promiseList.append({
                data    : fileNameList,
                resolve : function(fileNameList){
                    let resolve = _this._resolve_last_measurment.bind(_this),
                        reject  = _this._reject_last_measurment.bind(_this);

                    $.each(fileNameList, function(index, fileName){
                       window.intervals.addInterval({
                            duration        : 3,
                            fileName        : {mainDir: true, subDir: _this.options.subDir.observations, fileName: fileName},
                            resolve         : resolve,
                            reject          : reject,

                            useDefaultErrorHandler: false,
                            retries         : 3,
                            retryDelay      : 2*1000,
                            promiseOptions  : {noCache: true}
                        });
                    });
                }
            });

            //Call onFinally when all are ready
            ns.promiseList.append({data: {}, resolve: this._finally.bind(this) });
        },


        _resolve_setup : function(data){
            var _this = this;
            data = $.extend(true, {default_station:{}}, data);
            $.each(data.locationList || data.list, function(index, locationOptions){
                var nextLocation = _this.locations[locationOptions.id];

                //Check if the location is set to be inactive
                if (locationOptions.active === false)
                    nextLocation.active = false;

                //Append stations to location
                nextLocation.appendStations(locationOptions, data.default_station);

                //Assign the location to the observationGroups it belong to
                $.each(_this.observationGroups, function(id, observationGroup){
                    if (observationGroup.checkAndAdd(nextLocation)){
                        nextLocation.observationGroups[id] = observationGroup;
                        nextLocation.observationGroupList.push(observationGroup);
                    }
                });
                nextLocation.observationGroupList.sort(function(ob1, ob2){ return ob1.options.index - ob2.options.index; });
            });


            this.filesResolved++;
            if (this.filesResolved == this.fileNameList.length){
                //Update all Locations regarding active station etc.
                $.each(this.locations, function(locationId, location){
                    location._finally();
                });

                this.ready = true;
                this.onResolve();
            }
        },

        onResolve: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        _finally: function(){
            //When the object is created: Call all pending resolve-function (if any)
            this.resolvelist.forEach(resolve => resolve(this), this);
            this.loaded = true;
        },


        /*****************************************************
        _resolve_last_measurment
        Split geoJSON into a {features:[]} for each station
        *****************************************************/
        _resolve_last_measurment: function(geoJSON){
            var _this = this,
                stationGeoJSONs = {};

            $.each(geoJSON.features, function(index, feature){
                var stationId = feature.properties.id,
                    stationGeoJSON = stationGeoJSONs[stationId] = stationGeoJSONs[stationId] || {features:[]};
                stationGeoJSON.features.push(feature);
            });

            //Load each geoJSON "file" into station
            $.each(stationGeoJSONs, function(findStationId, geoJSON){
                $.each(_this.locations, function(locationId, location){
                    location.stationList.forEach((station) => {
                        if (station.id == findStationId){
                            station._resolveGeoJSON(geoJSON, false);
                            location.callUpdateObservation = true;
                        }
                    });
                });
            });
            $.each(_this.locations, function(locationId, location){
                if (location.callUpdateObservation){
                    location.updateObservation();
                    location.callUpdateObservation = false;
                }
            });
        },

        /*****************************************************
        _reject_last_measurment
        *****************************************************/
        _reject_last_measurment: function(){
            //Update observations to hide last measurements if they get to old
            this.locationList.forEach( (location) => { location.updateObservation(); });
        }
    };
}(jQuery, this.i18next, this.moment, this, document));


