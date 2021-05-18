/****************************************************************************
location-2-highcharts.js
Methods for creating Highcharts for a Location

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {},
        nsHC           = ns.hc = ns.highcharts = ns.highcharts || {};



    /****************************************************************************
    Extend Location with methods for creating and displaying a chart
    ****************************************************************************/
    $.extend(nsObservations.Location.prototype, {

        createCharts: function($container, inModal, mapOrMapId){
            var timeSeriesOptions = {
                    container: $container,
                    location : this.name,
                    parameter: [],
                    unit     : [],
                    series   : [],
                    yAxis    : []
                };

            $.each(this.observationGroupStationList, function(index, station){
                var stationChartsOptions = station.getChartsOptions(mapOrMapId);
                $.each(['parameter', 'unit', 'series', 'yAxis'], function(index, id){
                    timeSeriesOptions[id].push( stationChartsOptions[id] );
                });
           });


            if (!inModal)
                timeSeriesOptions.chartOptions = $.extend(true, timeSeriesOptions.chartOptions, {
                    chart: {
                        scrollablePlotArea: {
                            minWidth       : 2 * nsObservations.imgWidth,
                            scrollPositionX: 1
                        },

                        container: {
                            css: {
                                width : nsObservations.imgWidth +'px',
                                //height: nsObservations.imgHeight+'px',
                            }
                        }
                    }
                });

            nsHC.timeSeries(timeSeriesOptions);
        }

    });



}(jQuery, this.i18next, this.moment, this, document));


