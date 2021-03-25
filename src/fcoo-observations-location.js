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

//HER        if (this.options.hasForecast){
//HER            this.options.forecastFile = this.options.hasForecast === true ? this.options.id : this.options.hasForecast;
//HER
//HERconsole.log(this.options.id, '--', this.options.id.toLowerCase());
//HER
//HER$.each( this.stationList, function(i,s){
//HER    console.log(s.id, '--', _this.options.id.toLowerCase());
//HER});
//HER        }

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
console.log(this);
            return  (window.location.protocol == 'https:' ? 'https:' : 'http:') +
                    '//chart.fcoo.dk/station_timeseries.asp?' +
                        'LANG=' + (window.i18next.language.toUpperCase() == 'DA' ? 'DA' : 'ENG') + '&' +
                        'USER=DEFAULT&' +
                        'PARAMID=SeaLvl&' +
                        'WIDTH=' + imgWidth + '&' +
                        'HEIGHT=' + imgHeight + '&' +
                        'FORECASTMODE=' + (this.location.options.hasForecast ? '1' : '0') + '&' +
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



