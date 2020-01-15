/****************************************************************************
	fcoo-observations-location.js,

    Object representing a simgle location with multi-parameter observations

****************************************************************************/
(function ($, L, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo.observations = window.fcoo.observations || {},
        defaultOptions = {
            active: null
        },
        bsMarkerOptions = {
            size       : 'small',
            colorName  : 'orange',
            round      : true,
            transparent: true,
            hover      : true,
            tooltipHideWhenPopupOpen: true
        },
        imgWidth  = 600,
        imgHeight = 340; //Original = 400;

    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/

    ns.Location = function(options){
        var _this = this;
        this.options = $.extend({}, defaultOptions, options);

        this.latLng = this.options.position ? L.latLng( this.options.position ) : null;

        this.stationList = $.isArray(this.options.stationList) ? this.options.stationList : [this.options.stationList];

        //Check if the location has a active station
        $.each(this.stationList, function(index, stationOptions){
            var newStation = _this.stationList[index] = new ns.Station( stationOptions, _this );
            if (newStation.options.active && (_this.options.active !== false)){
                _this.options.active = true;
                if (newStation.options.prioritised)
                    _this.activeStation = newStation;
                else
                    _this.activeStation = _this.activeStation || newStation;
            }
        });

        if ((!this.latLng) && this.activeStation)
            this.latLng = L.latLng( this.activeStation.options.position );
    };

    ns.Location.prototype = {
        createMarker: function(){
            this.marker =
                L.bsMarkerCircle( this.latLng, bsMarkerOptions)
                    .bindTooltip(this.options.name);
            return this.marker;
        },

        addPopup: function(marker){
            marker.bindPopup({
                width  : 15 + imgWidth + 15,
                fixable: true,
                scroll : 'horizontal',
                header : {
                    icon: L.bsMarkerAsIcon(bsMarkerOptions.colorName),
                    text: [{da: 'Vandstand -', en: 'Sea level -'}, this.options.name]
                },
                //Add 'dummy' content to get popup dimentions correct on first open
                content: $('<div/>').css({width: imgWidth, height: imgHeight})
            });
            marker.on('popupopen', this.createPopupContent, this );
        },

        createPopupContent: function( popupEvent ){
            return this.activeStation.createPopupContent(popupEvent);
        }
    };

    /*****************************************************
    Station
    Reprecent a station with one or more parameters
    *****************************************************/
    ns.Station = function(options, location){
        this.options = $.extend({active: true}, options);
        this.location = location;
    };

    ns.Station.prototype = {
        _chartUrl: function(){
            return  (window.location.protocol == 'https:' ? 'https:' : 'http:') +
                    '//chart.fcoo.dk/station_timeseries.asp?' +
                        'LANG=' + (window.i18next.language.toUpperCase() == 'DA' ? 'DA' : 'ENG') + '&' +
                        'USER=DEFAULT&' +
                        'PARAMID=SeaLvl&' +
                        'WIDTH=' + imgWidth + '&' +
                        'HEIGHT=' + imgHeight + '&' +
                        'FORECASTMODE=' + (this.location.hasForecast ? '1' : '0') + '&' +
                        'AUTOSCALE=1&'+
                        'HEADER=0&' +
                        'NOLOGO=1&' +
                        'MODE=0&' +
                        'INFOBOX=1&' +
                        'FORECASTPERIOD=48&' +
                        'HINDCASTPERIOD=24&' +
                        'MODE=popup&' +
                        'ID=SEALVL_' + this.options.id;
        },

        createPopupContent: function( popupEvent ){
            popupEvent.popup.changeContent(
                $('<img/>')
                    .attr('src', this._chartUrl())
                    .css({width: imgWidth, height: imgHeight })
            );
        }
    };


}(jQuery, L, this, document));




;
/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create and internal FCOO packages to read and display observations

****************************************************************************/
(function ($, L, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo.observations = window.fcoo.observations || {};

	//Extend base leaflet class
    L.GeoJSON.FCOOObservations = L.GeoJSON.extend({

        //Default options
		options: {
            fileName: 'fcoo-observations.json',
            subDir  : 'observations',
			VERSION : "0.0.1"
		},

        //initialize
        initialize: function(initialize){
            return function (/*options*/) {

                var result = initialize.apply(this, arguments);

                this.options.pointToLayer = $.proxy(this.pointToLayer, this);
                this.options.onEachFeature = $.proxy(this.onEachFeature, this);

                this.list = [];

                //Read the meta-data
                window.Promise.getJSON( window.fcoo.dataFilePath(this.options.subDir, this.options.fileName), {}, $.proxy(this._resolve, this) );

                return result;
            };
        } (L.GeoJSON.prototype.initialize),


       //_resolve
       _resolve: function( data ){
            var geoJSON = {
                    type    : "FeatureCollection",
                    features: []
                },
                _this = this;

            //Create all locations and add them to the geoJSON-data
            $.each(data, function(index, locationOptions ){
                var loc = new ns.Location( locationOptions );
                _this.list.push( loc );

                if (loc.options.active)
                    geoJSON.features.push({
                        geometry: {
                            type       : "Point",
                            coordinates: [loc.latLng.lat, loc.latLng.lng]
                        },
                        type      : "Feature",
                        properties: { index: _this.list.length-1 }
                    });
                locationOptions.index = _this.list.length-1;
            });

            this.addData( geoJSON );
       },

        _findLocationByFeature: function( feature, methodName, arg ){
            var loc = this.list[ feature.properties.index ];
            return loc[methodName].apply(loc, arg);
        },

        pointToLayer: function (feature/*, latlng*/) {
            return this._findLocationByFeature( feature, 'createMarker'/*, arg*/ );
        },

        //onEachFeature
        onEachFeature: function (feature, layer) {
            return this._findLocationByFeature( feature, 'addPopup', [layer] );
        },
	});
}(jQuery, L, this, document));



