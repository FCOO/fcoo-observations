/****************************************************************************
21_location-highcharts.js
Methods for creating Highcharts for a Location

****************************************************************************/
(function ($, Highcharts, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {},
        nsHC           = ns.hc = ns.highcharts = ns.highcharts || {};

    nsObservations.updateLastObservationFuncList.push('updateCharts');
    nsObservations.updateObservationFuncList.push('updateCharts');
    nsObservations.updateForecastFuncList.push('updateCharts');


    Highcharts.USE_JB_STYLE = true;


    /****************************************************************************
    Extend Location with methods for creating, showing an updating charts with observations and forecasts
    ****************************************************************************/
    $.extend(nsObservations.Location.prototype, {
        /*****************************************************
        showCharts
        *****************************************************/
        showCharts: function(mapId){
            let timeSeries = this.timeSeries = nsHC.timeSeries( this._getChartsOptions(true, mapId) );
            this.modalCharts =
                $.bsModal({
                    header   : this.getHeader(),
                    flexWidth: true,
                    megaWidth: true,
                    content  : timeSeries.createChart.bind(timeSeries),
                    onClose: function(){ this.timeSeries = null; return true; }.bind(this),
                    remove : true,
                    show   : true
                });
        },


        /*****************************************************
        updateCharts
        To prevent multi update at the same time, the update
        is "delayed" 30 sek
        *****************************************************/
        updateCharts: function(){
            if (this.timeSeries){
                if (this.chartTimeoutId)
                    window.clearTimeout(this.chartTimeoutId);
                this.chartTimeoutId = window.setTimeout( this._updateCharts.bind(this), 30*1000);
            }
        },

        _updateCharts: function(){
            this.chartTimeoutId = null;
            if (this.timeSeries){
                let chartsOptions = this._getChartsOptions(true, 0);
                this.timeSeries.setAllData(chartsOptions.series);
            }
        },

        /*****************************************************
        _getChartsOptions
        *****************************************************/
        _getChartsOptions: function(inModal, mapOrMapId){
            let result = {
                    location : this.name,
                    parameter: [],
                    unit     : [],
                    series   : [],
                    yAxis    : [],
                    z        : [],
                    zeroLine : true,
                };

            this.stationList.forEach(station => {
                let stationChartsOptions = station.getChartsOptions(mapOrMapId, inModal);
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



}(jQuery, this.Highcharts, this.i18next, this.moment, this, document));


