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
    nsObservations.getMapId = function(map){ return map._leaflet_id; };



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
            groupFileName   : 'observations-groups.json',
            locationFileName: 'locations.json',
            fileName        : 'fcoo-observations.json',
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
                    }
                });
            });

            this.filesResolved++;
            if (this.filesResolved == this.fileNameList.length){

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
/*
        addTo: function(map){
            this.maps[this._mapId(map)] = map;
            if (this.ready)
                this._addTo(map);
            else
                map._fcoo_observations_not_added = true;
        },

        _addTo: function(map){
            map._fcoo_observations_not_added = false;

            //Convert all active locations into a geoJSON feature-group
            var _this = this,
                geoJSON = { type: "FeatureCollection", features: []};

            //Create all locations and add them to the geoJSON-data if they are active and included in a observation-group
            $.each(this.locations, function(locationId, location){
                if (location.active && location.observationGroupList.length)
                    geoJSON.features.push({
                        geometry: {
                            type       : "Point",
                            coordinates: [location.latLng.lng, location.latLng.lat]
                        },
                        type      : "Feature",
                        properties: {
                            location: location,
                            mapId   : _this._mapId(map)
                        }
                    });
            });

            var geoJSONLayer = new L.GeoJSON(geoJSON, geoJSONOptions);
            geoJSONLayer.addTo(map);

            return this;
        },
*/

        /**********************************************************
        geoJSON return a L.geoJSON layer
        **********************************************************/
        geoJSON: function(){
            var result = L.geoJSON(null);//, geoJSONOptions);

            result.on({
                add   : $.proxy(this.geoJSON_onAdd,    this),
                remove: $.proxy(this.geoJSON_onRemove, this)
            });
            return result;
        },

        geoJSON_onAdd: function(event){
            var geoJSONLayer = event.target,
                map          = geoJSONLayer._map,
                mapId        = nsObservations.getMapId(map);

            this.maps[mapId] = {
                map         : map,
                geoJSONLayer: geoJSONLayer,
                dataAdded   : this.ready
            };

            if (this.ready)
                geoJSONLayer.addData( this._getGeoJSONData() );
        },

        geoJSON_onRemove: function(event){
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
                            geometry: {
                                type       : "Point",
                                coordinates: [location.latLng.lng, location.latLng.lat]
                            },
                            type      : "Feature",
                            properties: {
                                location: location,
//HER TODO                                mapId   : _this._mapId(map)
                            }
                        });
                });
            }
            return this.geoJSONData;
        }
    };

    var geoJSONOptions = {
            pointToLayer: function (feature) {
                return findLocationByFeature( feature, 'createMarker');
            },

            //onEachFeature
            onEachFeature: function (feature, layer) {
                return findLocationByFeature( feature, 'addPopup', layer );
            },

        };

    function findLocationByFeature( feature, methodName, arg ){
        var argumentList = [feature.properties.mapId];
        if (arg)
            argumentList.push(arg);

        var location = feature.properties.location;
        return location[methodName].apply(location, argumentList);
    }



}(jQuery, L, this, document));



