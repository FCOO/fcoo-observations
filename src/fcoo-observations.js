/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, L, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    //nsObservations.getMapId(map) return the unique id for the map
    nsObservations.getMapId = function(map){ return ''+map._leaflet_id; };

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
            lastMeasurementFileName : 'LastObservations.json',
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
            fileName: {mainDir: true, subDir: _this.options.subDir.observations, fileName: _this.options.lastMeasurementFileName},
            resolve : $.proxy(_this._resolve_last_measurment, _this),
            reload  : 3
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

                //Assign the location to the observationsGroups it belong to
                $.each(_this.observationGroups, function(id, observationGroup){
                    if (observationGroup.checkAndAdd(nextLocation)){
                        nextLocation.observationGroups[id] = observationGroup;
                        nextLocation.observationGroupList.push(observationGroup);

                        nextLocation.$niels[id] = {};

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


                //All data are loaded => update the geoJSON-data and update any layer added before the data was ready
                this.ready = true;
                $.each(this.maps, function(id, options){
                    if (!options.dataAdded){
                        options.geoJSONLayer.addData( _this._getGeoJSONData() );
                        options.dataAdded = true;
                    }
                });
            }
        },

        _resolve_last_measurment: function(data){
            var _this = this;
            $.each(data.features, function(index, feature){
                var prop = feature.properties;
                $.each(_this.locations, function(locationId, location){
                    $.each(location.stations, function(stationId, station){
                        //If station exists and the station has the parameter => update
                        if (station.id == prop.id)
                            station.addLastObservation(prop);
                    });
                });
            });

            $.each(_this.locations, function(locationId, location){
                location.update();
            });
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

            result.options.onEachFeature = $.proxy(this._geoJSON_onEachFeature, result);

            result.on({
                add   : $.proxy(this._geoJSON_onAdd,    this),
                remove: $.proxy(this._geoJSON_onRemove, this)
            });
            return result;
        },

        //_geoJSON_onEachFeature: called with this = geoJSONLayer
        _geoJSON_onEachFeature: function(feature, marker) {
            feature.properties.addPopup( nsObservations.getMapId(this._map), marker );
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

            if (this.ready)
                geoJSONLayer.addData( this._getGeoJSONData() );
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

}(jQuery, L, this, document));



