const braille = require('./generatebraille.js');
const db = require('./database.js');
const { registerFont, createCanvas, loadImage } = require('canvas');
registerFont('./fonts/NotoSansJP-Regular.otf', { family: 'Noto Sans JP'});

const pixelWidth = 60;
const pixelHeight = 60;
const yCorrection = 0.158;
const maxRandomRadius = 24;
            
const boardImagePath = './assets/dart_board.png';
const handImagePath = './assets/dart_hand.png';
const brailleTreshold = 250;

const maxRounds = 5;
const secondsToInput = 10;
const timeToNextRound = 7000;
const timeToWaitForPlayers = 30000;

const maxPlayers = 5;
const minPlayers = 2;

const postDelay = 200;

var games = {};

class Ring{
    constructor(start, end, points, message){
        this.start = start;
        this.end = end;
        this.points = points;
        this.message = message;
    }
    
    getPointsString(){
        return ` You got ${this.points} points!`;
    }
}

const rings = [
    new Ring(0, 3, 25, "PogChamp bullseye!"),
    new Ring(3, 8, 18, "SeemsGood Second ring, pretty good."),
    new Ring(8, 16, 10, ":/ Are you sure you read the rules? Only third ring."),
    new Ring(16, 23, 5, "FailFish Fourth ring, are you afk?"),
    new Ring(23, 30, 1, "NotLikeThis Fifth ring. Embarrassing."),
    new Ring(30, Number.POSITIVE_INFINITY, 0, "BibleThump You missed the board and hit my beautiful wall instead.")
];

class Player {
    constructor(id, name){
        this.id = id;
        this.name = name;
        this.points = 0;
    }
}

class Game {
    constructor(channelObj, sayFunc, playerID, playerName){
        this.channelObj = channelObj;
        this.sayFunc = sayFunc;
        this.players = {};
        this.players[playerID] = new Player(playerID, playerName);
        this.currentPlayer = 0;
        this.round = 1;
        this.canvas = createCanvas(pixelWidth, pixelHeight);
        this.context = this.canvas.getContext('2d');
        this.waitForInput = {
            status: false,
            handle: null
        };
        this.hits = [];
        this.currentPoint = {
            x: 0,
            y: 0
        };
        this.generateRandomPointAscii = this.generateRandomPointAscii.bind(this);
        this.evaluateRound = this.evaluateRound.bind(this);
        this.endGame = this.endGame.bind(this);
        this.startMessage(this.getPlayerByIndex(this.currentPlayer).name);
        let startGame = this.generateRandomPointAscii;
        this.startHandle = setTimeout(function(){startGame();}, timeToNextRound);
        this.nextRoundHandle = null;
    }
    
    getPlayerByIndex(i){
        return this.players[Object.keys(this.players)[i]];
    }
    
    startMessage(player){
        this.sayFunc(this.channelObj.name, `/me ${player}, Get ready...`);
    }
    
    async generateRandomPointAscii(){
        let _this = this;
        await loadAndAddToCanvas(boardImagePath, 0, 0, this.context);
        this.addPreviousHits(this.hits);
        
        const radius = maxRandomRadius * Math.sqrt(Math.random());
        const angle = Math.random() * 2 * Math.PI;
        const x = pixelWidth/2 + radius * Math.cos(angle);
        const y = (pixelHeight/2 + radius * Math.sin(angle));
        await loadAndAddToCanvas(handImagePath, x, y-(pixelHeight * yCorrection), this.context);
        this.currentPoint.x = x;
        this.currentPoint.y = y;
        await this.sayFunc(this.channelObj.name, `/me Round ${this.round}/${maxRounds} ${printField(this.context)}`);
        await new Promise(resolve => setTimeout(resolve, postDelay));
        await this.sayFunc(this.channelObj.name, `/me You have ${secondsToInput} seconds!`);
        this.waitForInput.status = true;
        this.waitForInput.handle = setTimeout(function(){_this.evaluateRound("0r", "[Out of time]");}, secondsToInput*1000);
    }
    
    addPreviousHits(hits){
        const font = "8px Noto Sans JP";
        const align = "center";
        const yTextCorrection = 3;

        this.context.fillStyle = "black";
        this.context.font = font;
        this.context.textAlign = align;
        
        for(const hit of hits){
            if (hit.x < 0 || hit.x > pixelWidth || hit.y < 0 || hit.y > pixelHeight)
                continue;
            this.context.fillText('x', hit.x, hit.y+yTextCorrection);
        }
    }
    
    async evaluateRound(input, origin){
        if (!new RegExp(/^(\d+[udlr] )*(\d+[udlr] ?)$/g).test(input))
            return;
        clearTimeout(this.waitForInput.handle);
        this.waitForInput.status = false;
        for (let chunk of input.split(" ")){
            let characters = chunk.split("");
            let optionIndex = characters.findIndex(char => ['l', 'r', 'u', 'd'].includes(char));
            if (optionIndex !== -1 && optionIndex !== 0 && !isNaN(parseInt(characters.slice(0, optionIndex).join('')))){
                let steps = parseInt(characters.slice(0, optionIndex).join(''));
                switch(chunk[optionIndex]){
                    case 'l':
                        this.currentPoint.x -= steps;
                        break;
                    case 'r':
                        this.currentPoint.x += steps;
                        break;
                    case 'u':
                        this.currentPoint.y -= steps;
                        break;
                    case 'd':
                        this.currentPoint.y += steps;
                        break;
                }
            }
        }
        
        this.hits.push({x: this.currentPoint.x, y: this.currentPoint.y});
        let distanceFromMiddle = Math.sqrt(((pixelWidth/2 - this.currentPoint.x) ** 2) + ((pixelHeight/2 - this.currentPoint.y) ** 2));
        let ring = rings.find(elem => distanceFromMiddle >= elem.start && distanceFromMiddle <= elem.end);
        this.getPlayerByIndex(this.currentPlayer).points += ring.points;
        
        await loadAndAddToCanvas(boardImagePath, 0, 0, this.context);
        this.addPreviousHits([{x: this.currentPoint.x, y: this.currentPoint.y}]);
        await this.sayFunc(this.channelObj.name, `/me ${printField(this.context)}`);
        await new Promise(resolve => setTimeout(resolve, postDelay));
        
        await this.sayFunc(this.channelObj.name, `/me ${origin} ${ring.message}${ring.getPointsString()} Points overall: ${this.getPlayerByIndex(this.currentPlayer).points}`);
        await new Promise(resolve => setTimeout(resolve, postDelay));
        this.updateGameStatus();
    }
    
    updateGameStatus(){
        if (this.round === maxRounds && this.currentPlayer+1 >= Object.keys(this.players).length){
            this.endGame();
        } else {
            if (this.currentPlayer+1 >= Object.keys(this.players).length){
                this.round++;
                this.currentPlayer = 0;
            } else {
                this.currentPlayer++;
            }
            let _this = this;
            this.sayFunc(this.channelObj.name, `/me ${this.getPlayerByIndex(this.currentPlayer).name}, Get ready for the next round...`);
            this.nextRoundHandle = setTimeout(function(){_this.generateRandomPointAscii();}, timeToNextRound);
        }
    }
    
    concede(id){
        this.sayFunc(this.channelObj.name, `/me ${this.players[id].name} has given up :(`);
        delete this.players[id];
        clearTimeout(this.nextRoundHandle);
        clearTimeout(this.startHandle);
        clearTimeout(this.waitForInput.handle);
        this.endGame();
    }
    
    async endGame(){
        if (Object.keys(this.players).length > 0){
            let player = this.getPlayerByIndex(this.currentPlayer);
            this.sayFunc(this.channelObj.name, `/me Game is over! You got ${player.points} points and earned ${player.points}USh :D`);
            await db.addUserPoints(player.id, player.name, player.points);
            db.setHighscoreIfHigh(player.id, player.name, player.points, 'darts');
        }
        this.channelObj.gameRunning = false;
        delete games[this.channelObj.name];
    }
}

class GameParty extends Game {
    constructor(channelObj, sayFunc, playerID, playerName){
        super(channelObj, sayFunc, playerID, playerName);
        clearTimeout(this.startHandle);
        let _this = this;
        this.waitForJoin = {
            status: true,
            handle: setTimeout(function(){_this.startGame.bind(_this)();}, timeToWaitForPlayers)
        };
        this.startHandle = null;
    }
    
    startMessage(player){
        this.sayFunc(this.channelObj.name, `/me A new game of darts has been started! Type ${this.channelObj.prefix}join to play! \
        Starting in ${timeToWaitForPlayers / 1000} seconds. (${player} is already in)`);
    }
    
    addPlayer(playerName, playerID){
        if (Object.keys(this.players).length === maxPlayers || this.players.hasOwnProperty(playerID)){
            return;
        } else {
            this.players[playerID] = new Player(playerID, playerName);
            this.sayFunc(this.channelObj.name, `/me [${Object.keys(this.players).length}/${maxPlayers}] ${playerName} joined!`);
            if (Object.keys(this.players).length === maxPlayers){
                this.startGame();
            }
        }
    }
    
    startGame(){
        clearTimeout(this.waitForJoin.handle);
        this.waitForJoin.status = false;
        if (Object.keys(this.players).length < minPlayers){
            this.sayFunc(this.channelObj.name, "/me Seems like noone joined :(");
            this.channelObj.gameRunning = false;
            delete games[this.channelObj.name];
            return;
        }
        this.sayFunc(this.channelObj.name, `/me The Game is starting, ${this.getPlayerByIndex(this.currentPlayer).name}, Get ready...`);
        let genAscii = this.generateRandomPointAscii;
        this.startHandle = setTimeout(function(){genAscii();}, timeToNextRound);
    }
    
    concede(id){
        this.sayFunc(this.channelObj.name, `/me ${this.players[id].name} has given up :(`);
        let playerPos = Object.keys(this.players).indexOf(id);
        delete this.players[id];
        if (this.waitForJoin.status && Object.keys(this.players).length > 0)
            return;
        
        if (Object.keys(this.players).length < minPlayers){
            clearTimeout(this.nextRoundHandle);
            clearTimeout(this.startHandle);
            clearTimeout(this.waitForInput.handle);
            clearTimeout(this.waitForJoin.handle);
            this.endGame();
        } else {
            if (playerPos < this.currentPlayer){
                this.currentPlayer--;
                return;
            }
            
            if (playerPos === this.currentPlayer){
                clearTimeout(this.nextRoundHandle);
                clearTimeout(this.startHandle);
                clearTimeout(this.waitForInput.handle);
                if (playerPos > Object.keys(this.players).length-1){
                    this.updateGameStatus();
                } else {
                    let _this = this;
                    this.sayFunc(this.channelObj.name, `/me ${this.getPlayerByIndex(this.currentPlayer).name}, Get ready for the next round...`);
                    this.nextRoundHandle = setTimeout(function(){_this.generateRandomPointAscii();}, timeToNextRound);
                }
            }
        }
    }
    
    async endGame(){
        if (Object.keys(this.players).length >= 1 && !this.waitForJoin.status){
            let standingsList = Object.keys(this.players).sort((a, b) => (this.players[b].points - this.players[a].points));
            let winner = this.players[standingsList[0]];
            let reward = parseInt((this.players[standingsList[0]].points)*((standingsList.length/maxPlayers)+1));
            this.sayFunc(this.channelObj.name, `/me Game is over! Final standings: ${standingsList.map((id, i) => id = `${i + 1}. \
            ${this.players[id].name}: ${this.players[id].points}`).join(" | ")}. ${winner.name} wins ${reward} USh!`);
            await db.addUserPoints(winner.id, winner.name, reward);
            for (const id of standingsList){
                await db.setHighscoreIfHigh(this.players[id].id, this.players[id].name, this.players[id].points, 'darts');
            }
        } else {
            this.sayFunc(this.channelObj.name, "/me Too many people left :(");
        }
        this.channelObj.gameRunning = false;
        delete games[this.channelObj.name];
    }
}

module.exports = {
    playDarts: function(channelObj, sayFunc, user, input){
        if (!games.hasOwnProperty(channelObj.name)){
            switch(input[1]){
                case 'howtoplay':
                    sayFunc(channelObj.name, "/me A hand holding an arrow will appear in a random location on the board. "
                        +''+"You have to guess now, how many dots the hand should move to bring the arrow to the middle. "
                        +''+"The input has to look like this for exmaple: 2l 5u  This means 2 left and 5 up. You write r for right and d for down. "
                        +''+`But you have only ${secondsToInput} seconds to move, with your next input counting immediately. `
                        +''+"So dont waste time counting the dots, you have to estimate!");
                    break;
                case 'score':
                    db.getHighScore(user['user-id'], 'darts').then((score) => {
                        sayFunc(channelObj.name, `/me ${user['username']}s highscore is: ${score}`);
                    });
                    break;
                case 'party':
                case 'normal':
                    if (input[1] === 'normal')
                        games[channelObj.name] = new Game(channelObj, sayFunc, user['user-id'], user['username']);
                    else
                        games[channelObj.name] = new GameParty(channelObj, sayFunc, user['user-id'], user['username']);
                        channelObj.gameRunning = true;
                        channelObj.game = module.exports.playDarts;
                    break;
                case undefined:
                    let p = channelObj.prefix;
                    sayFunc(channelObj.name, "/me Available commands: "
                        +p+ "darts howtoplay - You should read this before playing to know the controls and rules, "
                        +p+ `darts normal - A ${maxRounds} round game for one player only, `
                        +p+ `darts party - Up to ${maxPlayers} players take turns for ${maxRounds} rounds, with the player with the most points a the end winning!`);
            }
            return;
        }
        
        let gameObj = games[channelObj.name];
        
        if (input[0] === channelObj.prefix+'concede' && gameObj.players.hasOwnProperty(user['user-id'])){
            gameObj.concede(user['user-id']);
            return;
;        }
        
        if (gameObj instanceof GameParty && gameObj.waitForJoin.status && input[0] === channelObj.prefix+'join'){
            gameObj.addPlayer(user['username'], user['user-id']);
            return;
        }
        
        if (gameObj.waitForInput.status && user['user-id'] === gameObj.getPlayerByIndex(gameObj.currentPlayer).id){
            gameObj.evaluateRound(input.join(" ").toLowerCase(), "");
        }
    }
};

function loadAndAddToCanvas(url, x, y, context){
    return loadImage(url)
        .then((image) => {
            context.drawImage(image, x, y, pixelWidth, pixelHeight);
            return 1;
        })
        .catch((err) => {
            console.log(`${err} An error occured! (image)`);
            return -1;
        });
}

function printField(context){
    let pixelData = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
    return braille.iterateOverPixels(pixelData, pixelWidth, brailleTreshold, false);
}
