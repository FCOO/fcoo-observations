/****************************************************************************
22_location-table.js


****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {}/*,
        nsHC           = ns.hc = ns.highcharts = ns.highcharts || {}*/;

    nsObservations.updateLastObservationFuncList.push('updateTables');
    nsObservations.updateObservationFuncList.push('updateTables');
    nsObservations.updateForecastFuncList.push('updateTables');


    /****************************************************************************
    Extend Location with methods for creating, showing an updating tables with observations and forecasts
    ****************************************************************************/
    $.extend(nsObservations.Location.prototype, {
        /*****************************************************
        showCharts
        *****************************************************/
        showTables: function(/*mapId*/){
            let //_this    = this,
                dataList = [],  //[]{timestamp, NxGROUP_ID: {obs:STRING, for:STRING}}
                dataObj  = {};  //{timestamp}{NxGROUP_ID: {obs:STRING, for:STRING}}

            //Create dataObj
            this.observationGroupStationList.forEach(station => {
                let groupId = station.observationGroup.id;
                $.each(station.getTableDataList(), (id, data) => {
                    if (data[groupId]){
                        let singleDataObj = dataObj[data.timestampValue] = dataObj[data.timestampValue] || {};
                        singleDataObj[groupId] = data[groupId];
                    }
                });
            });

            //Convert dataObj => dataList
            $.each(dataObj, (timestampValue, data) => {
                data.timestampValue = timestampValue;
                data.timestampMoment = moment(parseInt(data.timestampValue));
                dataList.push(data);
            });
            dataList.sort((data1, data2) => data1.timestampValue - data2.timestampValue );


            //Set options for table
            let tableOptions = {
                columns: [{
                    id    : 'timestampMoment',
                    header: {icon:'fa-clock', text: {da:'Tidsp.', en:'Time'}},
fixedWidth: true,
align: 'center',
vfFormat:'datetime_short',
                    noWrap: true
                }],



                content: dataList
            };

            this.observationGroupList.forEach( obsGroup => {
//HER   console.log('obsGroup', obsGroup);
                tableOptions.columns.push({
                    id    : obsGroup.id,
                    header: {
                        icon     : obsGroup.faIcon,
                        iconClass: obsGroup.faIconClass,
                        text     : obsGroup.header,
                    },
                    align : 'center',
                    noWrap: true,
vfFormat:'NIELS',

                });
            });


//HER   console.log('tableOptions', tableOptions);
//HER   console.log('this', this);

let bsTable = $.bsTable( tableOptions );

this.modalTables =  bsTable.asModal({
                        header   : this.getHeader(),
                        flexWidth: true,
                        megaWidth: true,
                        //content  : timeSeries.createChart.bind(timeSeries),
                        //onClose: function(){ _this.timeSeries = null; return true; },
                        remove : true,
                        show   : true
                    });



//HER               this.modalTables =
//HER                   $.bsModal({
//HER                       header   : this.getHeader(),
//HER                       flexWidth: true,
//HER                       //megaWidth: true,
//HER                       //content  : timeSeries.createChart.bind(timeSeries),
//HER                       content  : function( $body ){
//HER                           $body.append('HER');
//HER   //                        _this.timeSeries.createChart($body);
//HER                       },
//HER
//HER   //                    onClose: function(){ _this.timeSeries = null; return true; },
//HER                       remove : true,
//HER                       show   : true
//HER                   });



//HER   console.log('SHOW TABLES', this);

/*
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
*/
        },


        /*****************************************************
        updateTables
        *****************************************************/
        updateTables: function(){
//HER               console.log('updateTables', this);
        },


        /*****************************************************
        _getChartsOptions
        *****************************************************/
        YT__getChartsOptions: function(inModal, mapOrMapId){
            var result = {
                    location : this.name,
                    parameter: [],
                    unit     : [],
                    series   : [],
                    yAxis    : [],
                    zeroLine : true
                };

            $.each(this.observationGroupStationList, function(index, station){
                var stationChartsOptions = station.getChartsOptions(mapOrMapId, inModal);
                $.each(['parameter', 'unit', 'series', 'yAxis'], function(index, id){
                    result[id].push( stationChartsOptions[id] );
                });
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
        createTables
        *****************************************************/
        createTables: function(/*$container*/){

        }
    });



}(jQuery, this.i18next, this.moment, this, document));


