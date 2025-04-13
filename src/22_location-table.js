/****************************************************************************
22_location-table.js


****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
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
            let dataList = [],  //[]{timestamp, NxGROUP_ID: {obs:STRING, for:STRING}}
                dataObj  = {};  //{timestamp}{NxGROUP_ID: {obs:STRING, for:STRING}}

            //Create dataObj
            this.stationList.forEach(station => {
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
                fullWidth: true,
                firstColumnFixed: true,
                columns: [{
                    id          : 'timestampMoment',
                    header      : {icon:'fa-clock', text: {da:'Tidsp.', en:'Time'}},
                    fixedWidth  : true,
                    align       : 'center',
                    vfFormat    : 'datetime_short',
                    noWrap      : true
                }],
                content: dataList
            };

            this.observationGroupList.forEach( obsGroup => {
                //@todo if gruppe skal medtages (includeAll or selected in map/location MANGLER
                tableOptions.columns.push({
                    id    : obsGroup.id,
                    header: {
                        //icon     : obsGroup.faIcon,
                        iconClass: obsGroup.faIconClass,
                        text     : obsGroup.tableHeader,
                    },
                    align : 'center',
                    noWrap: true,

                    minimizable : true,
                    //minimized: true,
                    title        : obsGroup.tableTitle,
                    minimizedIcon: obsGroup.faIcon,
vfFormat:'NIELS',

                });
            });

let bsTable = $.bsTable( tableOptions );
this.modalTables =  bsTable.asModal({
                        header          : this.getHeader(),
                        flexWidth       : true,
                        megaWidth       : true,
                        allowFullScreen : true,                            
                        remove          : true,
                        show            : true
                    });

        },


        /*****************************************************
        updateTables
        *****************************************************/
        updateTables: function(){
        },




        /*****************************************************
        createTables
        *****************************************************/
        createTables: function(/*$container*/){

        }
    });



}(jQuery, this.i18next, this.moment, this, document));


