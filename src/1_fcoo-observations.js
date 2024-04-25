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
    FCOOObservations
    ****************************************************************/
    ns.FCOOObservations = function(options){
        var _this = this;
        this.options = $.extend(true, {}, {
			VERSION         : "{VERSION}",
            subDir          : {
                observations: 'observations',
                forecasts   : 'forecasts'
            },
            groupFileName           : 'observations-groups.json',
            locationFileName        : 'locations.json',
            fileName                : ['observations-sealevel.json','observations-current.json'/*, 'observations-wind.json'*/],
            lastObservationFileName : 'LastObservations_SEALVL.json LastObservations_CURRENT.json',
        }, options || {});

        this.init();

        this.ready = false;

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
            }
        });


        //Reads the files with the setup for the meassurements stations
        this.fileNameList = this.options.fileName;
        if (typeof this.fileNameList == 'string')
            this.fileNameList = this.fileNameList.split(' ');
        else
            this.fileNameList = $.isArray(this.options.fileName) ? this.options.fileName : [this.options.fileName];

        this.filesResolved = 0;

        $.each(this.fileNameList, function(index, fileName){
            ns.promiseList.append({
                fileName: ns.dataFilePath({subDir: _this.options.subDir.observations, fileName: fileName}),
                resolve : _this._resolve.bind(_this)
            });
        });


        //Read last measurement every 3 min
        //Only in test-mode window.intervals.options.durationUnit = 'seconds';
        ns.promiseList.append({
            data: {},
            resolve : function(/*data*/){
                let fileNameList = $.isArray(_this.options.lastObservationFileName) ? _this.options.lastObservationFileName : _this.options.lastObservationFileName.split(' '),
                    resolve      = _this._resolve_last_measurment.bind(_this),
                    reject       = _this._reject_last_measurment.bind(_this);

                $.each(fileNameList, function(index, fileName){
                   window.intervals.addInterval({
                        duration        : 3,
                        fileName        : {mainDir: true, subDir: _this.options.subDir.observations, fileName: fileName},
                        resolve         : resolve,
                        reject          : reject,

                        useDefaultErrorHandler: false,
                        retries         : 3,
                        retryDelay      : 15*1000,
                        promiseOptions  : {noCache: true}
                    })
                });
            }
        });
    };

    ns.FCOOObservations.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        _resolve : function(data){
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


