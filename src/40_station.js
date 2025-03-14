/****************************************************************************
station.js

Station  = Single observation-station with one or more parametre.
Only one station pro Location within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window, document, undefined) {
    "use strict";

    window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
        nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    function _Math(mathMethod, value1, value2){
        let isNumbers = (isNaN(value1) ? 0 : 1) + (isNaN(value2) ? 0 : 1);
        if (isNumbers == 2) return Math[mathMethod](value1, value2);
        if (isNumbers == 0) return undefined;
        return isNaN(value1) ? value2 : value1;
    }
    function max(value1, value2){ return _Math('max', value1, value2); }
    function min(value1, value2){ return _Math('min', value1, value2); }

    /*****************************************************
    Station
    Represent a station with one or more parameters
    *****************************************************/
    nsObservations.Station = function(options, location, observationGroup){
        this.id = options.id;
        this.options = options;
        this.location = location;
        this.observationGroup = observationGroup;

        this.parameterList = [];
        this.parameters = {};
        this.vectorParameterList = [];
        this.primaryParameter = null;

        function getAsList(opt){
            return Array.isArray(opt) ? opt : opt.split(' ');
        }

        //Set this.parameter = []{id:STRING, parameter:PARAMETER, unit:UNIT}
        let parameterList = getAsList(options.parameter),
            unitList      = options.unit ? getAsList(options.unit) : [];

        let addParameter = function(index, parameterId){
            let parameter = nsParameter.getParameter(parameterId),
                unit = index < unitList.length ? nsParameter.getUnit(unitList[index]) : parameter.unit,
                newParameter = {
                    id       : parameterId,
                    parameter: parameter,
                    unit     : unit
                };

            this.primaryParameter = this.primaryParameter || parameter;

            //If it is a vector => add speed- direction-, eastward-, and northward-parameter
            if (parameter.type == 'vector'){
                this.vectorParameterList.push(parameter);
                if (parameter.speed_direction.length){
                    addParameter(index, parameter.speed_direction[0].id);
                    addParameter(99999, parameter.speed_direction[1].id);
                }
                if (parameter.eastward_northward.length){
                    addParameter(index, parameter.eastward_northward[0].id);
                    addParameter(index, parameter.eastward_northward[1].id);
                }
            }

            this.parameterList.push(newParameter);
            this.parameters[newParameter.parameter.id] = newParameter;
        }.bind(this);

        $.each(parameterList, addParameter);

        this.observationDataList = []; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}
        this.forecastDataList    = []; //                    do

        /*
        Metadata for observations and forecast = {
            PARAMETER_ID: {
                timestamp: DATE_STRING      - When was det data changed
                unit     : UNIT or UNIT_ID  - The unit the data are in
                epoch    : DATE_STRING      - Epoch of the forecast
            }
        }
        */
        this.observationMetaData = {};
        this.forecastMetaData    = {};

        //Adjust options.observation and options.forecast to be {STANDARD_NAME: {subDir: STRING, fileName:STRING}}
        let adjust = function(options, subDirId){
            if (!options) return false;
            let newOptions = options;
            if (typeof options == 'string'){
                newOptions = {};
                $.each(this.parameters, function(parameterId){
                    newOptions[parameterId] = options;
                });
            }

            $.each(newOptions, function(parameterId, fileName){
                fileName = fileName.replace('{id}', this.id);
                newOptions[parameterId] = {mainDir: true, subDir: this.location.observations.options.subDir[subDirId], fileName: fileName};
            }.bind(this));

            return newOptions;
        }.bind(this);

        this.observation = adjust(options.observation, 'observations');
        this.forecast    = adjust(options.forecast,    'forecasts'   );


        //Set the format- and format-stat-method
        let formatterMethod     = observationGroup.options.formatterMethod,
            formatterStatMethod = observationGroup.options.formatterStatMethod;

        this.formatter     = formatterMethod     && this[formatterMethod]     ? this[formatterMethod]     : this.formatterDefault;
        this.formatterStat = formatterStatMethod && this[formatterStatMethod] ? this[formatterStatMethod] : this.formatterStatDefault;



    };


    nsObservations.Station.prototype = {
        /*****************************************************
        getDataList
        Return array of [timestamp, value] value = []FLOAT
        timestamp can be NUMBER or STRING
        *****************************************************/
        getDataList: function(parameter, forecast, minTimestampValue = 0, maxTimestampValue = Infinity, clip){
            let isVector         = parameter.type == 'vector',
                scaleParameter   = isVector ? parameter.speed_direction[0] : parameter,
                scaleParameterId = scaleParameter.id,
                dirParameterId   = isVector ? parameter.speed_direction[1].id : null,

                unit     = scaleParameter.unit,
                toUnit   = this.getDisplayUnit(scaleParameter),

                result   = [],
                dataList = forecast ? this.forecastDataList : this.observationDataList; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}

            $.each(dataList, function(index, dataSet){
                let timestampValue = moment(dataSet.timestamp).valueOf(),
                    value          = dataSet[scaleParameterId];


                if ((timestampValue >= minTimestampValue) && (timestampValue <= maxTimestampValue )){
                    //timestampValue inside min-max-range
                    let add = true;
                    if (clip){
                        //Check if timestampValue is OUTSIDE clip[0] - clip[1]
                        add = (timestampValue <= clip[0]) || (timestampValue >= clip[1]);
                    }
                    if (add){
                        value = nsParameter.convert(value, unit, toUnit);
                        result.push([
                            timestampValue,
                            isVector ? [value, dataSet[dirParameterId]] : value
                        ]);
                    }
                }
            });
            result.sort(function(timestampValue1, timestampValue2){ return timestampValue1[0] - timestampValue2[0];});
            return result;
        },


        /*****************************************************
        getDefaultObsAndForecast()
        Return an object with allmost all the content needed for
        creating charts or tables
        *****************************************************/
        getDefaultObsAndForecast: function(){
            let obsGroupOptions = this.observationGroup.options,
                parameter       = this.primaryParameter,
                result = {
                    startTimestampValue: moment().valueOf() - moment.duration(obsGroupOptions.historyPeriod).valueOf(),
                    parameter          : this.primaryParameter,
                    isVector           : parameter.type == 'vector',

                    forecastDataList           : null,
                    firstObsTimestampValue     : null,
                    lastObsTimestampValue      : null,
                    lastTimestampValueBeforeObs: 0,
                    firstTimestampValueAfterObs: Infinity
                };

            result.scaleParameter = result.isVector ? parameter.speed_direction[0] : parameter,
            result.obsDataList    = this.getDataList(parameter, false, result.startTimestampValue);
            result.unit           = this.getDisplayUnit(result.scaleParameter);

            if (this.forecast){
                result.forecastDataList = this.getDataList(parameter, true);
                result.firstObsTimestampValue = result.obsDataList.length ? result.obsDataList[0][0]                           : result.startTimestampValue;
                result.lastObsTimestampValue  = result.obsDataList.length ? result.obsDataList[result.obsDataList.length-1][0] : result.startTimestampValue;

                result.forecastDataList.forEach( data => {
                    let timestampValue = data[0];
                    if (timestampValue < result.firstObsTimestampValue)
                        result.lastTimestampValueBeforeObs = Math.max(timestampValue, result.lastTimestampValueBeforeObs);
                    if (timestampValue > result.lastObsTimestampValue)
                        result.firstTimestampValueAfterObs = Math.min(timestampValue, result.firstTimestampValueAfterObs);
                });

                //Data for forecast before AND after first and last observation
                result.forecastDataListNoObs = this.getDataList(parameter, true, result.startTimestampValue, Infinity, [result.lastTimestampValueBeforeObs, result.firstTimestampValueAfterObs]);

                //Data for forecast when there are observations
                result.forecastDataListWithObs = this.getDataList(parameter, true, result.lastTimestampValueBeforeObs, result.firstTimestampValueAfterObs);
            }

            return result;
        },

        /*****************************************************
        getDataSet(indexOrTimestampOrMoment, forecast)
        indexOrTimestampOrMoment:
            true => last dataSet
            number => index
            moment => moment.toISOString
            string => find dataSet with same timestamp
        *****************************************************/
        getDataSet: function(indexOrTimestampOrMoment, forecast){
            let dataList = forecast ? this.forecastDataList : this.observationDataList,
                result = null;

            if (!dataList.length)
                return null;

            //indexOrTimestampOrMoment == true => last dataSet
            if (indexOrTimestampOrMoment === true)
                return dataList[dataList.length-1];

            if (typeof indexOrTimestampOrMoment == 'number')
                return indexOrTimestampOrMoment < dataList.length ? dataList[indexOrTimestampOrMoment] : null;

            if (indexOrTimestampOrMoment instanceof moment){
                indexOrTimestampOrMoment = indexOrTimestampOrMoment.utc().toISOString();
            }

            //Find dataSet with timestamp == indexOrTimestampOrMoment
            dataList.forEach(dataSet => {
                if (dataSet.timestamp == indexOrTimestampOrMoment){
                    result = dataSet;
                    return true;
                }
            });
            return result;
        },

        /*****************************************************
        formatDataSet
        Return a formated string with the data
        Using this.formatter that is set by when the Station was created
        *****************************************************/
        formatDataSet: function(dataSet, forecast){

            if (!dataSet)
                return '?';

            //Check if all parameters has a value in dataSet
            let hasValueForAllParameters = true;
            function checkIfValuesExists(parameterList){
                $.each(parameterList, function(index, parameter){
                    if (dataSet[parameter.id] == undefined)
                        hasValueForAllParameters = false;
                });
            }
            $.each(this.parameters, function(parameterId, parameterOptions){
                let parameter = parameterOptions.parameter;
                if (parameter.type == "vector"){
                    //Check if there are values for speed/direction/eastware/northware
                    checkIfValuesExists(parameter.speed_direction);
                    checkIfValuesExists(parameter.eastward_northward);
                }
                else
                    checkIfValuesExists([parameter]);
            });

            //If all parameter are nedded and not all have value => return '?'
            if (!this.observationGroup.options.allNeeded && !hasValueForAllParameters)
                return '?';

            return this.formatter(dataSet, forecast);
        },

        /*****************************************************
        datasetIsRealTime(dataSet)
        Return true if the timestamp of the dataset is not to old
        "To old" is given by the observationGroup
        *****************************************************/
        datasetIsRealTime: function(dataSet){
            return dataSet && (moment().valueOf() <= (moment(dataSet.timestamp).valueOf() + this.observationGroup.maxDelayValueOf));
        },

        /*****************************************************
        getStat
        Calc the total stat for the given interval.
        Every hour is weighed equally
        *****************************************************/
        getStat: function(fromHour, toHour, forecast){
            let stat = {},
                statList = forecast ? this.forecastStatList : this.observationStatList;

            $.each(statList, function(hourValue, hourStat){
                if ((hourValue >= fromHour) && (hourValue <= toHour)){
                    $.each(this.parameters, function(parameterId){
                        let parameterHourStat = hourStat[parameterId];
                        if (parameterHourStat != undefined){
                            let parameterStat = stat[parameterId] = stat[parameterId] || {
                                    hours: toHour-fromHour+1,
                                    count: 0,
                                    min  : undefined,
                                    mean : 0,
                                    max  : undefined
                                };
                            parameterStat.min = min(parameterStat.min, parameterHourStat.min);
                            parameterStat.max = max(parameterStat.max, parameterHourStat.max);
                            //Mean of forecast and mean of observations is calculated as one value pro hour is used, regardless of the number of timestamps pro hour.
                            parameterStat.mean = (parameterStat.mean*parameterStat.count + parameterHourStat.mean)/(parameterStat.count+1);
                            parameterStat.count++;
                        }
                    });
                }
            }.bind(this));
            return stat;
        },


        /*****************************************************
        getPeriodStat(periodIndex, forecast)
        get the stat for period from/to now to/from nsObservations.observationPeriods[periodIndex]/nsObservations.forecastPeriods[periodIndex]
        Ex. getPeriodStat(1, true) will return the stat for the perion now (=0) to nsObservations.forecastPeriods[1] (default = 6);
        *****************************************************/
        getPeriodStat: function(periodIndex, forecast){
            if (forecast)
                return this.getStat(0/*fromHour*/, nsObservations.forecastPeriods[periodIndex]-1/*toHour*/, true/*forecast*/) || {};
            else
                return this.getStat(-1*nsObservations.observationPeriods[periodIndex]+1/*fromHour*/, 0/*toHour*/, false/*forecast*/ ) || {};
        },

        /*****************************************************
        formatStat
        Return a formated string with the stat
        Using this.formatterStat that is set when the Station was created
        *****************************************************/
        formatStat: function(stat, forecast){

            //Check that valid stat exists for alle parameters
            let statOk = true;
            function checkIfStatsExists(parameterList){
                $.each(parameterList, function(index, parameter){
                    let parameterStat = stat[parameter.id];
                    if (
                          !parameterStat ||
                          (parameterStat.count < parameterStat.hours * (forecast ? nsObservations.forecast_minimumPercentValues : nsObservations.observation_minimumPercentValues)) ||
                          (parameterStat.min == undefined) ||
                          (parameterStat.max == undefined)
                        )
                        statOk = false;
                });
            }
            $.each(this.parameters, function(parameterId, parameterOptions){
                let parameter = parameterOptions.parameter;
                if (parameter.type == "vector"){
                    checkIfStatsExists(parameter.speed_direction);
                    checkIfStatsExists(parameter.eastward_northward);
                }
                else
                    checkIfStatsExists([parameter]);
            });

            return statOk ? this.formatterStat(stat, forecast) : "?";
        },

        /*****************************************************
        formatPeriodStat
        Return a formated string with the stat from getPeriodStat
        *****************************************************/
        formatPeriodStat: function(periodIndex, forecast){
            return this.formatStat( this.getPeriodStat(periodIndex, forecast), forecast );
        },

        /**********************************************************************************************************
        **********************************************************************************************************/
        //formatter(dataSet, forecast) return a string with the value and units for the parameters in this station.
        //Is set when the Station was created
        formatter: function(/* dataSet, forecast */){ return 'ups'; },

        //formatXX(dataSet, forecast) Different format-methods for displaying single data-set

        /*****************************************************
        formatValue(value, parameter, unit)
        Return value formatted. Convert to this.options.formatUnit if needed
        *****************************************************/
        formatValue: function(value, parameter, unit, noUnitStr = false){
            return nsParameter.getParameter(parameter).format(value, !noUnitStr, unit);
        },

        /*****************************************************
        getDisplayUnit - Return the Unit to display the parameter in
        *****************************************************/
        getDisplayUnit: function(parameter){
            let parameterUnit = nsParameter.getParameter(parameter).unit,
                displayUnit   = nsParameter.getUnit(this.observationGroup.options.formatUnit || parameterUnit);

            //If displayUnit and parameterUnit are the same physical unit => use displayUnit else use parameter default unit
            if (
                (displayUnit.SI_unit && parameterUnit.SI_unit && (displayUnit.SI_unit == parameterUnit.SI_unit)) || //Both units have same SI-unit, OR
                (displayUnit.SI_unit == parameterUnit.id) ||                                                        //One of the units are the other unit's SI-unit
                (displayUnit.id == parameterUnit.SI_unit)
               )
                return displayUnit;
            else
                return parameterUnit;
        },

        /*****************************************************
        formatParameter - Simple display parameter
        *****************************************************/
        formatParameter: function(dataSet, parameter, forecast, noUnitStr){
            parameter = nsParameter.getParameter(parameter);

            let value         = dataSet[parameter.id],
                parameterUnit = parameter.unit,
                metaData      = (forecast ? this.forecastMetaData : this.observationMetaData)[parameter.id],
                valueUnit     = nsParameter.getUnit(metaData.unit || parameterUnit);

            //If parameter unit and value unit are differnet  => convert value to parameter unit
            if (parameterUnit.id != valueUnit.id)
                value = nsParameter.convert(value, valueUnit, parameterUnit);

            return this.formatValue(value, parameter, this.getDisplayUnit(parameter), noUnitStr);

        },

        /*****************************************************
        formatterDefault - Simple display the first parameter
        *****************************************************/
        formatterDefault: function(dataSet, forecast){
            return this.formatParameter(dataSet, this.parameterList[0].parameter, forecast);
        },

        /*****************************************************
        getVectorFormatParts
        Get all parts of a vector-parameter.
        Return []{vectorParameterId, speedParameterId, directionParameterId, speedStr, speed, unitStr, speedAndUnitStr, directionStr, direction, directionArrow, defaultStr}
        *****************************************************/
        getVectorFormatParts: function(dataSet, forecast){
            let result = [];
            this.vectorParameterList.forEach(function(vectorParameter){
                let speedParameterId     = vectorParameter.speed_direction[0].id,
                    directionParameter   = vectorParameter.speed_direction[1],
                    directionParameterId = directionParameter.id,
                    direction            = dataSet[directionParameterId],
                    oneVectorResult = {
                        vectorParameterId   : vectorParameter.id,
                        speedParameterId    : speedParameterId,
                        directionParameterId: directionParameterId,

                        speedStr         : this.formatParameter(dataSet, speedParameterId, forecast, true),
                        speed            : dataSet[speedParameterId],
                        unitStr          : this.getDisplayUnit(speedParameterId).translate('', '', true),
                        speedAndUnitStr  : this.formatParameter(dataSet, speedParameterId, forecast, false),

                        directionStr     : directionParameter.asText( dataSet[directionParameterId] ),
                        direction        : direction,
                        directionArrow   : '<i class="fa-direction-arrow ' + this.observationGroup.options.faArrow + '" style="rotate:'+direction+'deg;"></i>',
                        defaultStr       : ''
                    };

//dir-text + speed  oneVectorResult.defaultStr = oneVectorResult.directionStr + ' ' + oneVectorResult.speedAndUnitStr;
//dir-arrow + speed oneVectorResult.defaultStr = oneVectorResult.directionArrow + ' ' + oneVectorResult.speedAndUnitStr;
/* Speed + dir-arrow */
                oneVectorResult.defaultStr = oneVectorResult.speedAndUnitStr + ' ' + oneVectorResult.directionArrow;
                result.push(oneVectorResult);
            }.bind(this));
            return result;
        },

        /*****************************************************
        formatterVectorDefault - Display for the first vector-parameter
        *****************************************************/
        formatterVectorDefault: function(dataSet, forecast){
            return this.getVectorFormatParts(dataSet, forecast)[0].defaultStr;
        },

        /*****************************************************
        formatterVectorWind
        *****************************************************/
        formatterVectorWind: function(dataSet, forecast){
            let vectorPart = this.getVectorFormatParts(dataSet, forecast)[0];

            //TODO: Include wind-gust a la NNW 12 (14) m/s

            return vectorPart.defaultStr;
        },


        /*********************************************
        **********************************************
        formatterStatXX(stat, station)
        Different format-methods for the displaying statistics a single time period for different groups
        **********************************************
        *********************************************/
        //formatterStat(stat, forecast) return a string with the max, mean, min values
        //Is set by this.addObservationGroup
        formatterStat: function(/*stat, forecast*/){ return 'ups'; },



        /*****************************************************
        formatStatMinMaxMean
        *****************************************************/
        formatStatMinMaxMean: function(minStr, maxStr, meanStr, twoLines){
            return minStr + ''+ nsObservations.toChar + '' + maxStr + (twoLines ? '<br>' : ' ') + '(' + meanStr +')';
        },


        /*****************************************************
        formatStatParameter - Simple display stat for the first parameter
        *****************************************************/
        formatStatParameter: function(statId, stat, parameter, forecast, noUnitStr){
            let parameterId = nsParameter.getParameter(parameter).id,
                dataSet = {};
            dataSet[parameterId] = stat[parameterId][statId];

            return this.formatParameter(dataSet, parameter, forecast, noUnitStr);
        },


        /*****************************************************
        formatterStatDefault - Simple display stat for the first parameter
        *****************************************************/
        formatterStatDefault: function(stat, forecast){
            let parameter = this.parameterList[0].parameter;
            return this.formatStatMinMaxMean(
                this.formatStatParameter('min',  stat, parameter, forecast, true),
                this.formatStatParameter('max',  stat, parameter, forecast, true),
                this.formatStatParameter('mean', stat, parameter, forecast, true)
            );
        },

        /*****************************************************
        formatterStatVectorParameter
        Display stat for the a vector-parameter.
        Mean direction is calc from mean northward and mean eastward
        *****************************************************/
        formatterStatVectorParameter: function(stat, vectorParameter, forecast){
            let speedId       = vectorParameter.speed_direction[0].id,
                directionId   = vectorParameter.speed_direction[1].id,
                eastwardId    = vectorParameter.eastward_northward[0].id,
                eastwardMean  = stat[eastwardId].mean,
                northwardId   = vectorParameter.eastward_northward[1].id,
                northwardMean = stat[northwardId].mean;

            //Create dataSet with 'dummy' speed and mean direction
            let dataSet = {};
            dataSet[speedId]     = 1;
            dataSet[directionId] = 360 * Math.atan2(eastwardMean, northwardMean) / (2*Math.PI);

            let meanText    = this.formatStatParameter('mean', stat, speedId, forecast, true),
                vectorParts = this.getVectorFormatParts(dataSet, forecast)[0];

            return  this.formatStatMinMaxMean(
                        this.formatStatParameter('min',  stat, speedId, forecast, true),
                        this.formatStatParameter('max',  stat, speedId, forecast, true),
//                      vectorParts.directionStr + ' ' + meanText,   // Dir-text + speed
//                      vectorParts.directionArrow + ' ' + meanText, // Dir-arrow + speed
                        vectorParts.directionArrow + ' ' + meanText, // Speed + dir-arrow
                        true    //twoLines
                    );
        },

        /*****************************************************
        formatterStatVectorDefault
        Display stat for the first vector-parameter.
        *****************************************************/
        formatterStatVectorDefault: function(stat, forecast){
            return this.formatterStatVectorParameter(stat, this.vectorParameterList[0], forecast);
        },

        /*****************************************************
        formatteStatVectorWind - TODO
        *****************************************************/
        formatterStatVectorWind: function(stat, forecast){
            return this.formatterStatVectorDefault(stat, forecast);
        },



        /**********************************************************************************************************
        **********************************************************************************************************/

        /*****************************************************
        _resolveGeoJSON
        Convert observation or forecast from GEOJSON-file
        *****************************************************/
        _resolveGeoJSON: function(geoJSON, forecast){
            let dataList = forecast ? this.forecastDataList : this.observationDataList,
                metaData = forecast ? this.forecastMetaData : this.observationMetaData,
                features = geoJSON ? geoJSON.features : null;

            //Load new data
            features.forEach(function(feature){
                let properties  = feature.properties,
                    parameterId = properties.standard_name;


                //If the Station do not have the parameter => do not update
                if (!this.parameters[parameterId])
                    return;

                //Update meta-data
                metaData[parameterId] = $.extend(metaData[parameterId] || {}, {
                    unit            : properties.units,
                    owner           : properties.owner,
                    reference_level : properties.reference_level,
                    timestamp       : geoJSON.timestamp
                });

                $.each(properties.value, function(valueIndex, value){
                    if ((typeof value == 'number') && (value != properties.missing_value)){
                        let newDataSet = {timestamp: moment(properties.timestep[valueIndex]).utc().toISOString()},
                            found      = false;
                        newDataSet[parameterId] = value;

                        //Add parameterId, value, timestamp to
                        dataList.forEach((dataSet) => {
                            if (dataSet.timestamp == newDataSet.timestamp){
                                dataSet = $.extend(dataSet, newDataSet);
                                found = true;
                                return true;
                            }
                        });

                        if (!found)
                            dataList.push(newDataSet);
                    }
                });
            }.bind(this));

            //Sort by timestamp
            dataList.sort(function(dataSet1, dataSet2){
                return dataSet1.timestamp.localeCompare(dataSet2.timestamp);
            });


            //If the station contains vector-parameter => calc speed, direction, eastware and northware for all dataSet
            if (this.vectorParameterList)
                this.vectorParameterList.forEach((vectorParameter) => {
                    let speedId        = vectorParameter.speed_direction[0].id,
                        directionId    = vectorParameter.speed_direction[1].id,
                        eastwardId     = vectorParameter.eastward_northward ? vectorParameter.eastward_northward[0].id : null,
                        northwardId    = vectorParameter.eastward_northward ? vectorParameter.eastward_northward[1].id : null;

                    //Update meta-data
                    metaData[speedId]     = metaData[speedId]     || metaData[eastwardId]  || metaData[northwardId] || {};
                    metaData[northwardId] = metaData[northwardId] || metaData[eastwardId]  || metaData[speedId]     || {};
                    metaData[eastwardId]  = metaData[eastwardId]  || metaData[northwardId] || metaData[speedId]     || {};
                    metaData[directionId] = metaData[directionId] || {unit: "degree"}; //Hard-coded to degree

                    $.each(dataList, function(index2, dataSet){
                        let speedValue     = dataSet[speedId],
                            directionValue = dataSet[directionId],
                            eastwardValue  = eastwardId  ? dataSet[eastwardId]  : undefined,
                            northwardValue = northwardId ? dataSet[northwardId] : undefined;

                        if ( (eastwardValue !== undefined) && (northwardValue !== undefined)){
                            if (speedValue == undefined)
                                dataSet[speedId] = Math.sqrt(eastwardValue*eastwardValue + northwardValue*northwardValue);
                            if (directionValue == undefined)
                                dataSet[directionId] = 360 * Math.atan2(eastwardValue, northwardValue) / (2*Math.PI);
                        }
                        else
                            if ((speedValue !== undefined) && (directionValue !== undefined)){
                                let directionRad = 2*Math.PI * directionValue / 360;
                                if (eastwardValue == undefined)
                                    dataSet[eastwardId]  = Math.sin(directionRad) * speedValue;
                                if (northwardValue == undefined)
                                    dataSet[northwardId] = Math.cos(directionRad) * speedValue;
                            }
                    });
                });

            //Calculate hourly min, mean, and max in forecastStatList/observationStatList = [hour: no of hours since 1-1-1970]{parameterId: {min: FLOAT, mean: FLOAT, max: FLOAT}}
            let nowHourValue = moment().valueOf()/(60*60*1000),
                statList = this[forecast ? 'forecastStatList' : 'observationStatList'] = {};

            $.each(dataList, function(index3, dataSet){
                let hourValue = Math.ceil((moment(dataSet.timestamp).valueOf()/(60*60*1000) - nowHourValue) ),
                    hourStat = statList[hourValue] = statList[hourValue] || {};
                hourStat.hour = hourValue;

                $.each(this.parameters, function(parameterId){
                    let parameterValue = dataSet[parameterId];
                    if (parameterValue !== undefined){
                        let parameterStat = hourStat[parameterId] = hourStat[parameterId] || {count: 0, min: undefined, mean: 0, max: undefined};
                        parameterStat.min = min(parameterStat.min, parameterValue);
                        parameterStat.max = max(parameterStat.max, parameterValue);
                        parameterStat.mean = (parameterStat.mean*parameterStat.count + parameterValue)/(parameterStat.count+1);
                        parameterStat.count++;
                    }
                });

            }.bind(this));
        },



        /*****************************************************
        _resolveForecast
        *****************************************************/
        _resolveForecast: function(geoJSON, groupId){
            this.forecastDataList = [];
            this._resolveGeoJSON(geoJSON, true);

            this.location.updateForecast( groupId );
        },

        /*****************************************************
        _rejectForecast
        *****************************************************/
        _rejectForecast: function(error, groupId){
            this.location.updateForecast( groupId );
        },

        /*****************************************************
        _resolveObservations
        *****************************************************/
        _resolveObservations: function(geoJSON, groupId){
            this._resolveGeoJSON(geoJSON, false);
            this.location.updateObservation( groupId );
        },

        /*****************************************************
        _rejectObservations
        *****************************************************/
        _rejectObservations: function(error, groupId){
            this.location.updateObservation( groupId );
            this.location.observationIsLoaded = false; //Force reload next time
        },
    };


}(jQuery, this.i18next, this.moment, this, document));


