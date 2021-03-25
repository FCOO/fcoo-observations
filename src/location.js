/****************************************************************************
location.js

Location = group of Stations with the same or different paramtre

****************************************************************************/
(function ($, L, window, document, undefined) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};


    function getMapIdFromPopupEvent( popupEventOrMapId ){
        return typeof popupEventOrMapId == 'string' ? popupEventOrMapId : nsObservations.getMapId(popupEventOrMapId.target._map);
    }


    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/
    var bsMarkerOptions = {
            size       : 'small',
            //size       : 'normal',
            colorName  : 'orange',
            round      : false,

            scaleInner      : 150,
            markerClassName : 'overflow-hidden obs-grp-marker',

            transparent: true,

            hover      : true,
            tooltipHideWhenPopupOpen: true
        };
//HER        imgWidth  = 600,
//HER        imgHeight = 340; //Original = 400;

    nsObservations.Location = function(options){
        options = this.options = $.extend(true, {}, {active: true}, options);

        this.id = options.id;
        this.active = options.active;
        this.latLng = options.position ? L.latLng( options.position ) : null;

        this.stationList = [];
        this.stations = {};

        //observationGroups and observationGroupList = the gropup this location belongs to
        this.observationGroups = {};
        this.observationGroupList = [];

        //observationGroupStations = {observationGroup-id: Station} = ref to the active/prioritized Station (if any) used for the ObservationGroup
        this.observationGroupStations = {};

        //$niels = {observationGroup-id: {map-id: $-element}} set of $-elements containing the last measured value. There is a $-element for each map and each observation-group
        this.$niels = {}

        this.popups = {};
    };

    nsObservations.Location.prototype = {
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
            if (typeof stationList == 'string')
                stationList = stationList.split(' ');
            stationList = $.isArray(stationList) ? stationList : [stationList];

            var hasActiveStation = false;
            $.each(stationList, function(index, stationOptions){
                if (typeof stationOptions == 'string')
                    stationOptions = {id: stationOptions};

                stationOptions = $.extend(true, {}, defaultStationOptions, stationOptions );
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
                        $.each(station.parameters, function(parameterId, parameterOptions){
                            if ( (parameterId == observationGroup.options.parameterId) ||
                                 (parameterOptions.parameter.group == observationGroup.options.parameterGroup) )
                                //The station is active and have parameter from observationGroup. If it is prioritized or the first station
                                activeStation = station.options.prioritized ? station : (activeStation || station);
                        });
                });

                if (activeStation){
                    _this.active = wasActive;
                    _this.observationGroupStations[observationGroupId] = activeStation;
                    activeStation.observationGroup = observationGroup;
                }
            });
        },

        /*********************************************
        isVisible(mapId) - return true if the location is shown on the map (mapId)
        *********************************************/
        isVisible: function(mapId){
            var result = false;
            $.each(this.observationGroups, function(id, observationGroup){
                if (observationGroup.isVisible(mapId))
                    result = true;
            });
            return result;
        },

        /*********************************************
        createMarker
        *********************************************/
        createMarker: function(/*mapId*/){
            var markerOptions = $.extend(true, {}, bsMarkerOptions);

            markerOptions.innerIconClass = [];
            $.each(this.observationGroupList, function(index, observationGroup){
                var ogIndex = observationGroup.options.index;
                markerOptions.innerIconClass.push(observationGroup.options.icon+' obs-grp-icon-'+ogIndex);
                markerOptions.markerClassName += ' obs-grp-marker-'+ogIndex;
            });

            return L.bsMarkerCircle( this.latLng, markerOptions)
                       .bindTooltip(this.options.name);
        },

        /*********************************************
        update
        Update all $-elements in $niels with latest value
        $niels = {observationGroup-id: {map-id: $-element}} set of $-elements
        containing the last measured value. There is a $-element for each map and each observation-group
        *********************************************/
        update: function(){
            var _this = this;
            $.each(this.observationGroupStations, function(observationGroupId, station){
                if (_this.$niels[observationGroupId]){
                    var newValueFormat = station.format(true, true); //Last observation, test timestep for being 'late'
                    $.each(_this.$niels[observationGroupId], function(mapId, $element){
                        $element.html(newValueFormat);
                    });
                }
            });

        },

        /*********************************************
        addPopup
        *********************************************/
        addPopup: function(mapId, marker){
            marker.bindPopup({
//HER                width  : 15 + imgWidth + 15,
//HER                width  : 15 + imgWidth + 15,
                width  : 200,
//HER                flexWidth: true,
                fixable: true,
                scroll : 'horizontal',

                noVerticalPadding:  true,
                //noHorizontalPadding: true,

                header : {
                    icon: L.bsMarkerAsIcon(bsMarkerOptions.colorName, null, {faClassName:'fa-square'}),
                    text: this.options.name
                },

                isMinimized: true,
                minimized: {
                    content            : ' '
                },



                extended: {
                    width  : 300,
                    height: 200,
                    content: 'Ext'
                    //Add 'dummy' content to get popup dimentions correct on first open
                    //content: $('<div/>').css({width: imgWidth, height: imgHeight})
                }
            });
            marker.on('popupopen',  this.popupOpen,  this );
            marker.on('popupclose', this.popupClose, this );
        },

        /*********************************************
        popupOpen
        *********************************************/
        popupOpen: function( popupEvent ){
            var mapId = nsObservations.getMapId(popupEvent.target._map);
            this.popups[mapId] = popupEvent.popup;
            this.createPopupContent(mapId);
        },

        /*********************************************
        popupClose
        *********************************************/
        popupClose: function( popupEventOrMapId ){
            this.popups[getMapIdFromPopupEvent(popupEventOrMapId)] = null;
        },


        /*********************************************
        createPopupContent
        *********************************************/
        createPopupContent: function( popupEventOrMapId ){
            var _this = this,
                mapId = getMapIdFromPopupEvent(popupEventOrMapId),
                popup = this.popups[mapId],
                content = {
                    minimized: {
                        width              : 66,
                        noVerticalPadding  : true,
                        noHorizontalPadding: true,
                        center             : true,
                        showHeaderOnClick  : true,
                        content            : []
                    },
                    content: [
                        {type:'textbox', text: {da: 'Vandstand', en:'Sea Level'}, center:true},
                        //{type:'select', selectedId:'no2', items: [{id:'no1', text:'Vandstand'}, {id:'no2', text: 'Noget anden'}]},

                        {type: 'text', label: {da:'Seneste måling', en:'Latest measurement'}, center: true, class:'DETTE_ER_GODT', text: ' '},

                        //this.$test2,
                        {type:'textbox', label: {da:'Prognoser', en:'Forecasts'}, text: 'Her kommer 0-6, 6-12 og 12-24 timers prognoser', center:true}
                    ],

                };


            //Create minimized content = list of parameter-name, last value
            var minimizedContent = content.minimized.content;
            $.each(this.observationGroupList, function(index, observationGroup){
                _this.$niels[observationGroup.id] = _this.$niels[observationGroup.id] || {};
                var $div =
                    $('<div/>')
                        .addClass('latest-measurement text-center obs-grp-marker obs-grp-marker-'+observationGroup.options.index)
                        ._bsAddHtml({text: observationGroup.options.name, textClass:'XXd-block obs-group-header'})
                        ._bsAddHtml({text: ' ', textStyle: 'bold', textClass:'d-block'});

                _this.$niels[observationGroup.id][mapId] = $div.find('span:last-child');

                minimizedContent.push($div);

            });
            this.update();
/*

            popup.changeContent({

                minimized: {
                    width: 50, center: true,

                    showHeaderOnClick: true,

//    content: {type:'textbox', text:'12&nbsp;m/s&nbsp;NNW', center: true},

                    _content: this.$test,

                    content: [Math.round(Math.random()*10000), '<br>', this.$niels[mapId]],

                    noVerticalPadding:  true,
                    noHorizontalPadding: true,
                },

            });
*/
            popup.changeContent(content);

            this.$test2 = popup.bsModal.$body.find('.input-group.DETTE_ER_GODT div.container-icon-and-text span');


//HER'HER KOMMER DER EN GRAF OG NOGET ANDET...');
            //this.activeStation.createPopupContent(popupEvent);
        }
    };

}(jQuery, L, this, document));



