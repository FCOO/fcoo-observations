/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, L, i18next, moment, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    //nsObservations.getMapId(mapOrMapIdap) return the unique id for the map
    nsObservations.getMapId = function(mapOrMapId){
        return typeof mapOrMapId == 'string' ? mapOrMapId : ''+mapOrMapId._leaflet_id;
    };

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
            groupFileName           : 'observations-groups.json', //Not used at the moment
            locationFileName        : 'locations.json',
            fileName                : 'fcoo-observations.json',
            lastObservationFileName : 'LastObservations.json',
        }, options || {});

        this.maps = {};

        this.ready = false;

        //Read observations-groups
        this.observationGroupList = [];
        this.observationGroups = {};
        ns.promiseList.append({
            //fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.groupFileName}),
            data    : nsObservations.observationGroupData,
            resolve : function(data){
                $.each(data, function(index, options){
                    options.index = _this.observationGroupList.length;
                    var newObservationGroup = new nsObservations.ObservationGroup(options, _this);
                    _this.observationGroupList.push(newObservationGroup);
                    _this.observationGroups[newObservationGroup.id] = newObservationGroup;
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

        this.fileNameList = this.options.fileName;
        if (typeof this.fileNameList == 'string')
            this.fileNameList = this.fileNameList.split(' ');
        else
            this.fileNameList = $.isArray(this.options.fileName) ? this.options.fileName : [this.options.fileName];

        this.filesResolved = 0;

        $.each(this.fileNameList, function(index, fileName){
            ns.promiseList.append({
                fileName: ns.dataFilePath({subDir: _this.options.subDir.observations, fileName: fileName}),
                resolve : $.proxy(_this._resolve, _this)
            });
        });


        //Read last measuremnt every 3 min
        ns.promiseList.append({
            fileName: {mainDir: true, subDir: _this.options.subDir.observations, fileName: _this.options.lastObservationFileName},
            resolve : $.proxy(_this._resolve_last_measurment, _this),
            reload  : 3,
            promiseOptions: {noCache: true}
        });




    };

    ns.FCOOObservations.prototype = {
        _mapId: function(map){
            return nsObservations.getMapId(map);
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

                //All data are loaded => initialize all maps and update the geoJSON-data and update any layer added before the data was ready
                this.ready = true;
                this._initializeMaps();
                $.each(this.maps, function(id, options){
                    if (!options.dataAdded){
                        options.geoJSONLayer.addData( _this._getGeoJSONData() );
                        options.dataAdded = true;
                    }
                });
            }
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
                    $.each(location.stations, function(stationId, station){
                        if (stationId == findStationId){
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

        _initializeMaps: function(map){
            var _this = this,
                maps = map ? [{map:map}] : this.maps;
            $.each(maps, function(index, mapObj){
                var mapId = nsObservations.getMapId(mapObj.map);
                $.each(_this.observationGroups, function(groupId, observationGroup){
                    var stateId = groupId+'_'+mapId,
                        show = _this.state && _this.state[stateId];
                    observationGroup.toggle(mapObj.map, !!show);
                });
            });
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
            var mapId = nsObservations.getMapId(mapOrMapId),
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
            this.geoJSONOptions = this.geoJSONOptions || {
                pointToLayer : function(geoJSONPoint/*, latlng*/) {
                    return geoJSONPoint.properties.createMarker();
                }
            };

            var result = L.geoJSON(null, this.geoJSONOptions);

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
            var mapId = nsObservations.getMapId(this._map),
                location = this.fcooObservation.locations[marker.options.locationId];

            location.markers[mapId] = marker;
            feature.properties.addPopup( mapId, marker );
        },

        _geoJSON_onAdd: function(event){
            var geoJSONLayer = event.target,
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
            var map   = event.target._map,
                mapId = nsObservations.getMapId(map);
            delete this.maps[mapId];
        },

        _getGeoJSONData: function(){
            var _this = this;
            if (!this.ready)
                return null;

            if (!this.geoJSONData){
                this.geoJSONData = { type: "FeatureCollection", features: []};

                //Create all locations and add them to the geoJSON-data if they are active and included in a observation-group
                $.each(this.locations, function(locationId, location){
                    if (location.active && location.observationGroupList.length)
                        _this.geoJSONData.features.push({
                            type      : "Feature",
                            geometry  : {type: "Point", coordinates: [location.latLng.lng, location.latLng.lat]},
                            properties: location
                        });
                });
            }
            return this.geoJSONData;
        }
    };

}(jQuery, L, this.i18next, this.moment, this, document));



