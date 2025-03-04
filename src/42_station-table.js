/****************************************************************************
42_station-table.js

Load and display time-series in a table

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};



    $.valueFormat.add({
        id     : 'NIELS',
        format : function( value/*, options */){
            let result = '';
            if (value.obs){
                result = value.obs;
                if (value.for)
                    result += '&nbsp;/&nbsp;';
            }
            if (value.for)
                result += '<em>'+value.for+'</em>';
            return result;
        }

    });


    /****************************************************************************
    Extend Station with methods for creating and displaying a table
    ****************************************************************************/
    $.extend(nsObservations.Station.prototype, {
        /*****************************************************
        getTableDataList
        Return a {timestampValue}{GROUPID:{for:STRING, obs:STRING}}
        *****************************************************/
        getTableDataList: function(){
            let groupId = this.observationGroup.id,
                data = this.getDefaultObsAndForecast(),
                result = {};

            ['obsDataList', 'forecastDataListNoObs', 'forecastDataListWithObs'].forEach( function(listName, index){
                let list = data[listName] || [],
                    isForecast = !!index;
                if (!list) return;
                list.forEach( function(singleData){
                    let timestampValue  = singleData[0],
                        timestampMoment = moment(timestampValue),
                        dataSet = this.getDataSet(timestampMoment, isForecast),
                        row = result[timestampValue] = result[timestampValue] || {timestampValue: timestampValue};

                    row[groupId] = row[groupId] || {};
                    row[groupId][isForecast ? 'for' : 'obs'] = this.formatDataSet(dataSet, isForecast);
                }.bind(this));
            }.bind(this));
            return result;
        },

        /*****************************************************
        createTable
        *****************************************************/
        createTable: function(){

        },

    });



}(jQuery, this.i18next, this.moment, this, document));


