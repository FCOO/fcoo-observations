/****************************************************************************
location.js

Location = group of Stations with the same or different paramtre

****************************************************************************/
(function ($, L, i18next, moment, window, document, undefined) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    nsObservations.toChar = '&#9656;'; //Same as in fcoo-jquery-bootstrap-highcharts/src/time-series.js


    function getMapIdFromPopupEvent( popupEventOrMapId ){
        return typeof popupEventOrMapId == 'string' ? popupEventOrMapId : nsObservations.getMapId(popupEventOrMapId.target._map);
    }


    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/
    var bsMarkerOptions = {
            size     : 'small',
            colorName: 'orange',
            round    : false,

            scaleInner      : 150,
            markerClassName : 'overflow-hidden',

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
        this.observationGroupStationList = [];

        /*
        modalElements = {
            observationGroup-id: {
                map-id: {
                    $lastObservation      : []$-element   //Set of $-elements containing the last measured value
                    $observationStatistics: []$-element   //Set of $-elements containing the statistics for previous observations for eg. 6h, 12h, and 24h = nsObservations.observationPeriods
                    $forecastStatistics   : []$-element   //Set of $-elements containing the forecast statistics for eg. 6h, 12h, and 24h = nsObservations.forecastPeriods
                }
            }
        }
        There is a {$lastObservation, $observationStatistics, $forecastStatistics} with $-elements for each map and each observation-group
        */
        this.modalElements = {};

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
        isShownInModal() - return true if the location has any data (observation and/or forecast) shown in any modal (eg. popup)
        *********************************************/
        isShownInModal: function(){
            var result = false;

            $.each(this.modalElements, function(observationGroupId, maps){
                $.each(maps, function(mapId, elementGroups){
                    $.each(elementGroups, function($elementGroupId, elementList){
                        if (elementList && elementList.length)
                            result = true;
                    });
                });
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
                markerOptions.innerIconClass.push(observationGroup.options.icon+' obs-group-icon-'+ogIndex);
                markerOptions.markerClassName += ' obs-group-marker-'+ogIndex;
            });

            return L.bsMarkerCircle( this.latLng, markerOptions)
                       .bindTooltip(this.options.name);
        },


        /*****************************************************
        loadObservation
        Load observation for all stations and parameter (if any) and update observationDataList and call location.updateObservation()
        NOYE: The data is only loaded ONCE since loading last observation will update observationDataList
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
            //If the location of the station has any data displayed in any modal => load
            if (this.isShownInModal()){
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
        _updateAny$elemetList
        Update all $-elements in the list of $-elements
        *********************************************/
        _updateAny$elemetList: function(listId, valueFunc /*function(station)*/){
            var _this = this;
            $.each(this.observationGroupStations, function(observationGroupId, station){
                $.each(_this.modalElements[observationGroupId], function(mapId, elements){
                    $.each(elements[listId] || [], function(index, $element){
                        $element.html(valueFunc(station, index));
                    });
                });
            });
            return this;
        },

        /*********************************************
        updateObservation
        Update all $-elements in with latest value and stat (min, mean, max) for observations
        modalElements[observationGroupId][mapId].$lastObservation: []$-element set of $-elements
        containing the last measured value. There is a []$-element for each map and each observation-group
        *********************************************/
        updateObservation: function(){
            //If not shown in modal => exit
            if (!this.isShownInModal())
                return;

            //Update last observation
            this._updateAny$elemetList('$lastObservation',
                function(station){ // = function(station, index)
                    var dataSet = station.getDataSet(true, false); //Last observation
                    //If the timestamp is to old => return '?'
                    if ( !dataSet ||
                         (moment().valueOf() > (moment(dataSet.timestamp).valueOf() + station.observationGroup.maxDelayValueOf))
                       )
                        return '?';
                    return station.formatDataSet(dataSet, false);
                }
            );

            //Update stat for previous observations
            this._updateAny$elemetList('$observationStatistics',
                function(station, index){
                    return station.formatStat(station.getStat(-1*nsObservations.observationPeriods[index]+1, 0, false) || {}, false);
                }
            );
            return this;
        },

        /*********************************************
        updateForecast
        Update all $-elements in with stat (min, mean, max) for forecast
        modalElements[observationGroupId][mapId].$forecastStatistics: []$-element.
            One $-element for each interval defined by nsObservations.forecastPeriods
        *********************************************/
        updateForecast: function(){
            this._updateAny$elemetList('$forecastStatistics',
                function(station, index){
                    return station.formatStat(station.getStat(0, nsObservations.forecastPeriods[index]-1, true) || {}, true);
                }
            );
        },




        /*********************************************
        addPopup
        *********************************************/
        addPopup: function(mapId, marker){
            marker.bindPopup({
                width  : 240,
                //flexWidth: true,
                fixable: true,
                scroll : 'horizontal',

                noVerticalPadding:  true,
                //noHorizontalPadding: true,

                header : {
                    icon: L.bsMarkerAsIcon(bsMarkerOptions.colorName, null, {faClassName:'fa-square'}),
                    text: this.options.name
                },

                isMinimized: true,
                minimized  : {content: ' '},

                extended: {
                    width  : 300,
                    height : 200,
                    content: 'Chart - TODO',
                    footer: false,
                },
                footer: {da:'Format: Min'+nsObservations.toChar+'Maks (Middel)', en:'Format: Min'+nsObservations.toChar+'Max (Mean)'},

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
            var _this = this,
                mapId = getMapIdFromPopupEvent(popupEventOrMapId);
            $.each(this.observationGroupStations, function(observationGroupId/*, station*/){
               _this.modalElements[observationGroupId][mapId] = null;
            });
            this.popups[mapId] = null;
        },


        /*********************************************
        createPopupContent
        *********************************************/
        createPopupContent: function( popupEventOrMapId ){
            var _this = this,
                tempClassName = ['TEMP_CLASS_NAME_0', 'TEMP_CLASS_NAME_1', 'TEMP_CLASS_NAME_2'],
                mapId = getMapIdFromPopupEvent(popupEventOrMapId),
                popup = this.popups[mapId],
                hasAnyForecast = false,
                content = {
                    minimized: {
                        width              : 70,
                        //noVerticalPadding  : true,
                        //noHorizontalPadding: true,
                        center             : true,
                        showHeaderOnClick  : true,
                        content            : []
                    },
                    content: [
                        {type: 'textbox', label: {da:'Forrige målinger ', en:'Previous Measurements'}, textClass: tempClassName[0], center: true, text: {da:' '}},
                        {type: 'textbox', label: {da:'Seneste måling',    en:'Latest Measurement'},    textClass: tempClassName[1], center: true, text: {da:' '}},
                        {type: 'textbox', label: {da:'Prognoser',         en:'Forecasts'},             textClass: tempClassName[2], center: true, text: {da:' '}}
                    ],

                };


            /*Create content:
                minimized = list of parameter-name, last value
                normal    = table with previous measurments, list of last observation(s)  and table with forecast statistics
                extended  = table with all observations + forecast and chart
            */
            var minimizedContent = content.minimized.content,
                $table_prevObservation = $('<table/>').addClass('obs-statistics'),
                $table_lastObservation = $('<table/>').addClass('last-observation'),
                $table_forecast = $table_prevObservation.clone();

                //Add header to previous observation and forecast
                var $tr = $('<tr/>').appendTo($table_prevObservation);
                $.each(nsObservations.observationPeriods, function(index, hours){
                    $('<td></td>')
                        .i18n({da:'Seneste '+hours+'t', en:'Prev. '+hours+'h'})
                        .appendTo($tr);
                });

                $tr = $('<tr/>').appendTo($table_forecast);
                $.each(nsObservations.forecastPeriods, function(index, hours){
                    $('<td></td>')
                        .i18n({da:'Næste '+hours+'t', en:'Next '+hours+'h'})
                        .appendTo($tr);
                });

            $.each(this.observationGroupList, function(index, observationGroup){
                _this.modalElements[observationGroup.id] = _this.modalElements[observationGroup.id] || {};

                //Add the group-name as a header but only visible when there is only one group visible
                content.content.unshift({type: 'textbox', text: observationGroup.header, center: true, class:'obs-group-header show-for-single-obs-group show-for-obs-group-'+observationGroup.options.index});

                //Check if any stations have forecast
                var hasForecast = _this.observationGroupStations[observationGroup.id].forecast;
                if (hasForecast)
                    hasAnyForecast = true;

                var newElements =
                        _this.modalElements[observationGroup.id][mapId] = {
                            $lastObservation      : [],
                            $observationStatistics: [],
                            $forecastStatistics   : []
                        };

                //Content for minimized mode
                var $div =
                    $('<div/>')
                        .addClass('latest-observation text-center no-border-border-when-last-visible show-for-obs-group-'+observationGroup.options.index)
                        ._bsAddHtml({text: observationGroup.shortName, textClass:'obs-group-header show-for-multi-obs-group fa-no-margin'})
                        ._bsAddHtml({text: ' ', textStyle: 'bold', textClass:'d-block'});

                newElements.$lastObservation.push($div.find('span:last-child'));

                minimizedContent.push($div);

                /******************************************
                Content for normal mode - last observation
                *******************************************/
                var $tr = $('<tr/>')
                            .addClass('show-for-obs-group-'+observationGroup.options.index)
                            .appendTo($table_lastObservation);
                $('<td/>')
                    .addClass('obs-group-header show-for-multi-obs-group')
                    ._bsAddHtml({text: observationGroup.name})
                    .appendTo($tr);

                var $td = $('<td/>')
                    .css('font-size', 'larger')
                    .addClass('font-weight-bold')
                    .appendTo($tr);

                newElements.$lastObservation.push($td);


                /******************************************
                Content for normal mode - previous observations and forecast statistics
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
                    var $span =
                            $('<span/>')
                                .addClass('value')
                                .html(withSpinner ? '<i class="'+ns.icons.working+'"/>' : '&nbsp;');
                    $('<td/>')
                        .append($span)
                        .appendTo($tr);
                    return $span;
                }

                //Create table with stat for previous observations and stat for forecast
                var $tr_prevObservation = $('<tr/>')
                        .addClass('font-weight-bold no-border-border-when-last-visible show-for-obs-group-'+observationGroup.options.index)
                        .appendTo($table_prevObservation),
                    $tr_forecast = $tr_prevObservation.clone().appendTo($table_forecast),
                    i;

                for (i=0; i<nsObservations.observationPeriods.length; i++)
                    newElements.$observationStatistics.push( appendValueTd($tr_prevObservation, i==1));

                if (hasForecast){
                    for (i=0; i<nsObservations.forecastPeriods.length; i++)
                        newElements.$forecastStatistics.push( appendValueTd($tr_forecast, i==1));
                }
                else {
                    $('<td colspan="'+nsObservations.forecastPeriods.length+'"/>')
                        ._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
                        .appendTo($tr_forecast);
                }

            });

            //Load observation
            this.loadObservation();

            //Load forecast (if any)
            this.loadForecast();

            popup.changeContent(content);

            //Insert $table_XX instead of span or remove it
            $.each([
                $table_prevObservation,
                $table_lastObservation,
                hasAnyForecast ? $table_forecast : $('<span/>')._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
            ], function(index, $element){
                var $span = popup.bsModal.$body.find('.'+tempClassName[index]),
                    $container = $span.parent();

                $span.remove();
                $container.append($element);
            });

//HER'HER KOMMER DER EN GRAF OG NOGET ANDET...');
            //this.activeStation.createPopupContent(popupEvent);


        } //End of createPopupContent
    };

}(jQuery, L, this.i18next, this.moment, this, document));



