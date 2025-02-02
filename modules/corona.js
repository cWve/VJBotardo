const fetch = require("node-fetch");
const braille = require('./generatebraille.js');
const db = require('./database.js');

const frameDelay = 120;

var csvData;
loadData();


// The input data consists of comma separated values for each country. 
// The first 4 values in each line correspond to the Country, State and Latitude and Longitude.
// The following values in the line are numerical values corresponding to Coronavirus cases.
// Data starts at 22/1/2020
// Parsing data for queried country      australia,0,0,0,1,2,5,10 --> [0,0,0,1,2,5,10]
function parseData(country, dateStart, dateEnd, sayFunc, channelObj) {
    let multipleMatches = false;
    let rawCountryData = [];
    const dayInMiliseconds = 60 * 60 * 24 * 1000;
    const baseDate = new Date('2020-01-22');

    const diffDaysStart = Math.round(Math.abs(dateStart - baseDate) / dayInMiliseconds);
    const diffDaysEnd = Math.round(Math.abs(dateEnd - baseDate) / dayInMiliseconds) + 1;
    const regex = new RegExp(`\\b${country}\\b`);
    for (let i = 0; i < csvData.length; i++) {
        if (regex.test(csvData[i])) {
            let numericalData = csvData[i].split(',').slice(4 + diffDaysStart, diffDaysEnd + 4).map(function (x) {
                return parseInt(x);
            });

            // Deal with more than 1 row of data per country (USA, canada, etc)
            if (multipleMatches === false) {
                multipleMatches = true;
                rawCountryData = numericalData;
            } else if (multipleMatches === true) {
                for (let j = 0; j < rawCountryData.length; j++) {
                    rawCountryData[j] += numericalData[j];
                }
            }
        }
    }
    if (rawCountryData.length === 0) {
        sayFunc(channelObj.name, "/me There doesn't seem to be data for this country.");
        return -1;
    }
    return rawCountryData;
}


// [0,0,0,1,2,5,10,15] --> [0,0] [0,1] [2,5] [10,15] --> [0, 1, 7, 25]
function createHistogram(data, bins, height, sayFunc, channelObj) {
    if (bins > data.length) {
        sayFunc(channelObj.name, "/me Width is too large or data range is too short to fit the data.");
        return -1;
    }

    let minBinSize = Math.trunc(data.length / bins);
    // the number of bins given via input (aka make sure we get desired width)
    let binChange = bins - data.length % bins;
    let histogramData = [];
    let j = 0;
    for (let i = 0; i < bins; i++) {
        let bin = [];
        let binSize = minBinSize;
        if (i >= binChange) {
            binSize++;
        }
        bin = data.slice(j, j + binSize);
        j += binSize;

        // Add all the elements in the bin into one single value [1,2,3,4] --> 10
        histogramData.push(bin.reduce(function (accumulator, currentValue) {
            return accumulator + currentValue;
        }));
    }

    // Scale histogram according to height
    const dataMax = Math.max(...histogramData);
    histogramData = histogramData.map(function (x) {
        return Math.round(x / dataMax * height);
    });

    return histogramData;
}


//		  [0, 0, 0, 0, ^
// 		   0, 0, 1, 0, |
// [0,2,4,3] -->   0, 0, 1, 1, | height
// 		   0, 1, 1, 1, |
// 		   0, 1, 1, 1] ∨
function histogramToMatrix(data, height) {
    let matrix = [];
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < data.length; j++) {
            if (data[j] === height) {
                matrix = matrix.concat([255, 255, 255, 1]);
            } else {
                matrix = matrix.concat([0, 0, 0, 1]);
                data[j]++;
            }
        }
    }
    return matrix;
}


function loadData() {
    fetch("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv")
        .then((response) => {
            return response.text();
        })
        .then((text) => {
            if (text !== "" && text)
                csvData = text.toLowerCase().split(/\r?\n/);
        })
        .catch(function (e) {
            console.log(e);
        });
}


function emojiToLetter(RIS) {
    let codepointHex = parseInt(RIS.codePointAt(0).toString(16), 16);
    if (codepointHex >= 0x1F1E6 && codepointHex <= 0x1F1FF) {
        latinChar = String.fromCharCode(codepointHex - 0x1F1E6 + 65);
        return latinChar;
    } else {
        return RIS;
    }
}


async function corona(channelObj, sayFunc, userInput, gifSpam) {
    if (typeof userInput === 'undefined' || userInput === "") {
        sayFunc(channelObj.name, `/me Correct usage: ${channelObj.prefix}corona <country>`);
        return;
    }

    // Default values
    const maxCharacters = 460;
    let height = 52;
    let width = 60;
    let dateStart = new Date('2020-01-22'); //Start of data record
    let dateEnd = new Date(); //Today
    let gifMode = false;

    // Parsing of parameters
    userInput = userInput.toLowerCase().split(" ");
    
    
    //Check from and to options
    let dateVars = [dateStart, dateEnd];
    ['-f', '-t'].forEach((opt, i) => {
        let optIndex = userInput.findIndex(str => str === opt);
        if (optIndex !== -1 && optIndex+1 < userInput.length){
            let newDate = new Date(userInput[optIndex+1]);
            if (newDate !== "Invalid Date" && newDate.getTime() >= dateStart && newDate.getTime() <= dateEnd.getTime())
                dateVars[i] = newDate;
        }
    });
    if (dateVars[0] < dateVars[1])
        dateStart = dateVars[0], dateEnd = dateVars[1];
    
    
    //Check height and width options
    let sizeVars = [height, width];
    ['-h', '-w'].forEach((opt, i) => {
        let optIndex = userInput.findIndex(str => str === opt);
        if (optIndex !== -1 && optIndex+1 < userInput.length && !isNaN(parseInt(userInput[optIndex+1]))){
            sizeVars[i] = parseInt(userInput[optIndex+1]);
        }
    });
    if ((sizeVars[1]/2) * (sizeVars[0]/4) <= maxCharacters){
        height = sizeVars[0];
        width = sizeVars[1];
    } else {
        sayFunc(channelObj.name, `/me You reached the character limit ${maxCharacters}. Adjust your height and width.`);
        return;
    }
    
    
    //Check gif option
    gifMode = (userInput.findIndex(str => str === "-g") !== -1) && gifSpam;
    
    

    // Try to recognize country provided by user
    let inputCountry = userInput.findIndex(e => e.charAt(0) === '-');
    inputCountry = Array.from(inputCountry === -1 ? userInput.join(" ") : userInput.slice(0, inputCountry).join(" ")).map(emojiToLetter).join("").toLowerCase();
    let country = await db.getCoronaCountry(inputCountry);
    if (country === -1){
        sayFunc(channelObj.name, "/me Input was not recognised as a country.");
        return;
    }
    
   
    // Print graph in multiple frames if gifMode
    if (gifMode) {
        const frames = 15;
        const initialDayOffset = 60;
        const dateStart = new Date('2020-01-22');
        let movingDate = new Date(dateStart.valueOf());
        movingDate.setDate(movingDate.getDate() + initialDayOffset);

        const dayInMiliseconds = 60 * 60 * 24 * 1000;
        const  daysSinceStart = Math.round(Math.abs(new Date() - dateStart) / dayInMiliseconds);
        //Days we move forward every frame. This is calculated such that  we always reach the end of the data and we never exceed 20 frames in total.
        const advanceDays = Math.ceil((daysSinceStart - initialDayOffset) / (frames - 1));

        for (let i = 0; i < frames; i++) {
            await new Promise(resolve => setTimeout(resolve, frameDelay));
            if (coronaGenAscii(country, dateStart, movingDate, width, height, sayFunc, channelObj) === -1) {
                break;
            }
            movingDate.setDate(movingDate.getDate() + advanceDays);
        }
    } else {
        coronaGenAscii(country, dateStart, dateEnd, width, height, sayFunc, channelObj);
    }

}


function coronaGenAscii(country, start, end, width, height, sayFunc, channelObj) {
    let cumulativeData = parseData(country, start, end, sayFunc, channelObj);
    if (cumulativeData === -1) {
        return -1;
    }

    let dailyData = [];
    for (let i = 1; i < cumulativeData.length; i++) {
        dailyData.push(cumulativeData[i] - cumulativeData[i - 1]);
    }


    let histogram = createHistogram(dailyData, width, height, sayFunc, channelObj);
    if (histogram === -1) {
        return -1;
    }
    matrix = histogramToMatrix(histogram, height);

    sayFunc(channelObj.name, braille.iterateOverPixels(matrix, width, 128, false));
}


module.exports.corona = corona;
module.exports.loadCoronaData = loadData;
