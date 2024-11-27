/****************************************************************************
21_location-highcharts.js
Methods for creating Highcharts for a Location

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {},
        nsHC           = ns.hc = ns.highcharts = ns.highcharts || {};

    nsObservations.updateLastObservationFuncList.push('updateCharts');
    nsObservations.updateObservationFuncList.push('updateCharts');
    nsObservations.updateForecastFuncList.push('updateCharts');


    /****************************************************************************
    Extend Location with methods for creating, showing an updating charts with observations and forecasts
    ****************************************************************************/
    $.extend(nsObservations.Location.prototype, {
        /*****************************************************
        showCharts
        *****************************************************/
        showCharts: function(mapId){
            let _this = this;

            //this.timeSeries = this.timeSeries || nsHC.timeSeries(this._getChartsOptions(/*$container, */true, mapOrMapId);
            let timeSeries = this.timeSeries = nsHC.timeSeries( this._getChartsOptions(true, mapId) );

            this.modalCharts =
                $.bsModal({
                    header   : this.getHeader(),
                    flexWidth: true,
                    megaWidth: true,
                    content  : timeSeries.createChart.bind(timeSeries),
                    _content  : function( $body ){
                        _this.timeSeries.createChart($body);
                    },

                    onClose: function(){ _this.timeSeries = null; return true; },
                    remove : true,
                    show   : true
                });
        },


        /*****************************************************
        updateCharts
        *****************************************************/
        updateCharts: function(){
            if (this.timeSeries){
                let chartsOptions = this._getChartsOptions(true, 0);
                this.timeSeries.setAllData(chartsOptions.series);
            }
        },


        /*****************************************************
        _getChartsOptions
        *****************************************************/
        _getChartsOptions: function(inModal, mapOrMapId){
            var result = {
                    location : this.name,
                    parameter: [],
                    unit     : [],
                    series   : [],
                    yAxis    : [],
                    z        : [],
                    zeroLine : true
                };

            this.observationGroupStationList.forEach(station => {
                var stationChartsOptions = station.getChartsOptions(mapOrMapId, inModal);
                ['parameter', 'unit', 'series', 'yAxis', 'z'].forEach( id => result[id].push( stationChartsOptions[id] ) );
           });

           result.chartOptions = $.extend(true, result.chartOptions,
                inModal ? {

                } : {
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

            return result;
        },

        /*****************************************************
        createCharts
        *****************************************************/
        createCharts: function(inModal, mapOrMapId){
            let timeSeriesOptions = this._getChartsOptions(inModal, mapOrMapId);

            let timeSeries = nsHC.timeSeries(timeSeriesOptions);
            return timeSeries;
        }
    });



}(jQuery, this.i18next, this.moment, this, document));


