const sqlite = require('sqlite3');

const dbPath = typeof global.it === 'function' ? './testdatabase.db' : './database.db';
//i know bad practice but best way for me to do it
var db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error(err.message);
  }
  module.exports.sendQuery("pragma foreign_keys = ON;"); 
});


module.exports = {
    sendQuery: function(sqlQuery, showError=true){
        return new Promise(function(resolve){
            db.run(sqlQuery, [], function(err){
                if (err){
                    if (showError){
                        console.error(err.message);
                        resolve(err.message);
                    } else {
                        resolve("error");
                    }
                } else {
                    resolve("success");
                }
            });
        });
    },
    showRows: function(sqlQuery){
        return new Promise(function(resolve){
            db.all(sqlQuery, [], function(err, rows){
                if (err) 
                    resolve(err.message);
                if (typeof rows !== 'undefined')
                    resolve(rows.map(function(row){return JSON.stringify(row);}));
                else
                    resolve('Something went wrong.');
            });
        });
    },
    closeDB: function(){
        db.close((err) => {
            if (err) {
                console.error(err.message);
            }
        });
    },
    
    insertEmote: function(id, name, url){
        let sql = 'INSERT INTO emote(emote_id, name, url) VALUES(?, ?, ?)';
        db.run(sql, [id, name, url], function(err){
            if (err)
                console.log(err.message);
        });
    },
    getLastEmoteID: function(){
        return new Promise(function(resolve){
            let sql = 'SELECT MAX(emote_id) FROM emote';
            db.get(sql, [], function(err, row){
                if (err){
                    console.log(err);
                    resolve(-1);
                    return;
                }
                if (Object.values(row)[0] === null){
                    resolve(0);
                    return;
                } else {
                    resolve(Object.values(row)[0]);
                }
            });
        });
    },
    getEmoteByName: function(name){
        return new Promise(function(resolve){
            let sql = 'SELECT * FROM emote WHERE name = ? ORDER BY emote_id DESC LIMIT 1';
            db.get(sql, [name], function(err, row){
                if (err){
                    console.log(err);
                    resolve(-1);
                    return;
                }
                if (typeof row  === 'undefined'){
                    resolve(-1);
                    return;
                } else {
                    resolve(row);
                }
            });
        });
    },
    getRandomEmote: function(keyword){
        return new Promise(function(resolve){
            keyword = typeof keyword === 'undefined' ? '' : keyword;
            sql = 'SELECT * FROM emote WHERE name LIKE ? ORDER BY RANDOM() LIMIT 1';
            db.get(sql, ['%'+keyword+'%'], function(err, row){
                if (err){
                    console.log(err);
                    resolve(-1);
                    return;
                }
                if (typeof row === 'undefined'){
                    resolve(-1);
                    return;
                } else {
                    resolve(row);
                }
            });
        });
    },
    
    addUserPoints: function(id, name, points){
        checkIfUserExists(id)
            .then((result) => {
                if (result){
                    sql = 'UPDATE USER SET points = points + ? WHERE id = ?';
                    db.run(sql, [points, id], function(err){
                        if (err){
                            return console.error(err.message);
                        }
                    });
                } else {
                    insertNewUser(id, name, points, 0);
                }                    
            })
            .catch((err) => {
                console.error(err);
            });
    },
    //this function is terrible, really ashamed of it, but sadly too lazy to refactor it since i would need to refactor A LOT in ttt, never lucky
    getPoints: function(channelObj, attribute, value, callback){
        let sql = 'SELECT points FROM USER WHERE LOWER('+attribute+') = LOWER(?)';
        db.get(sql, [value], (err, row) => {
            if (err){
                reject(err.message);
            }
            if (typeof row === 'undefined'){
                callback(channelObj, value, 0);
            } else {
                callback(channelObj, value, row.points);
            }
        });
    },
    getSnakeScore: function(id){
        return new Promise(function(resolve){
           sql = 'SELECT snake_highscore FROM user where id = ?';
           db.get(sql, [id], function(err, row){
               if (err){
                   console.log(err);
                   resolve(0);
                   return;
               }
               resolve(Object.values(row)[0]);
           });
        });
    },
    setHighscoreIfHigh: async function(id, name, score){
        if (await checkIfUserExists(id)){
            sql = 'UPDATE user SET snake_highscore = ? WHERE ? > snake_highscore AND id = ?';
            db.run(sql, [score, score, id], function(err){
                if (err){
                    console.log(err);
                    return;
                }
            });
        } else {
            insertNewUser(id, name, 0, score);
        }
    },
    getTopUserScores: function(top, type){
        return new Promise(function(resolve){
            switch (type){
                case 'snake': type = 'snake_highscore';break;
                case 'points': type = 'points';break;
                default: resolve(-1);return;
            }
            let sql = 'SELECT username, '+type+' FROM user ORDER BY '+type+' DESC LIMIT ?';
            db.all(sql, [top], (err, row) => {
                if (err){
                    console.log(err.message);
                    resolve(-1);
                    return;
                }
                resolve(row.map((user, index) => index+1 + '. ' + user.username + ' - ' + user[type]).join(' | '));
            });
        });
    },
    
    getAllData: function(callback, table){
        return new Promise(function(resolve){
            let sql = 'SELECT * FROM ' +table;
            db.each(sql, [], (err, row) => {
                if (err){
                    console.error(err.message);
                    return;
                }
                callback(...Object.values(row));
            });
            resolve();
        });
    },
    insertNewChannel: function(id, name){
        return new Promise(function(resolve){
            let sql = 'INSERT INTO CHANNEL(channel_id, channel_name) VALUES(?, ?)';
            db.run(sql, [id, name], function(err){
                if (err){
                    console.error(err.message);
                    resolve(err.message);
                    return;
                }
                resolve(1);
            });
        });
    },
    deleteChannel: function(id){
        return new Promise(function(resolve){
            let sql = 'DELETE FROM CHANNEL WHERE channel_id = ?';
            db.run(sql, [id], function(err){
                if (err){
                    console.error(err.message);
                    resolve(err.message);
                    return;
                }
                resolve(1);
            });
        });
    },
    insertNewCommand: function(name, cooldown, minCooldown, maxCooldown, devOnly, changeable){
        return new Promise(function(resolve){
            let sql = 'INSERT INTO COMMAND(command_name, cooldown, min_cooldown, max_cooldown, dev_only, changeable) VALUES(?, ?, ?, ?, ?, ?)';
            db.run(sql, [name, cooldown, minCooldown, maxCooldown, devOnly, changeable], function(err){
                if (err){
                    console.error(err.message);
                    resolve(err.message);
                    return;
                }
                resolve(1);
            });
        });
    },
    setChannelValue: function(id, option, value){
        return new Promise(function(resolve){
            let column;
            switch (option){
                case 'modsCanEdit': column = 'mods_can_edit'; break;
                case 'prefix': column = 'prefix'; break;
                case 'whileLive': column = 'while_live'; break;
                case 'gifSpam': column = 'gif_spam'; break;
                default: resolve(-1); return;
            } 
            let sql = 'UPDATE CHANNEL SET ' +column+ ' = ? WHERE channel_id = ?';
            db.run(sql, [value, id], function(err){
                if (err){
                    console.error(err.message);
                    resolve(-1);
                    return;
                }
                resolve(1);
            });
        });
    },
    setChannelCommandValue: function(id, command, option, value){
        return new Promise(function(resolve){
            let column;
            switch (option){
                case 'enabled': column = 'enabled'; break;
                case 'cooldown': column = 'cooldown'; break;
                default: resolve(-1); return;
            }
            let sql = 'UPDATE CHANNEL_COMMAND SET ' +column+ ' = ? WHERE channel_id = ? AND command_name = ?';
            db.run(sql, [value, id, command], function(err){
                if (err){
                    console.error(err.message);
                    resolve(-1);
                    return;
                }
                resolve(1);
            });
        });
    },
    getChannelCommandValue: function(id, command, option){
        return new Promise(function(resolve){
            let column;
            switch (option){
                case 'enabled': column = 'enabled'; break;
                case 'cooldown': column = 'cooldown'; break;
            }
            let sql = 'SELECT ' +column+ ' FROM CHANNEL_COMMAND WHERE channel_id = ? AND command_name = ?';
            db.get(sql, [id, command], (err, row) => {
                if (err){
                    console.error(err.message);
                    resolve(-1);
                    return;
                }
                
                if (typeof row === 'undefined' || row === null){
                    resolve(-1);
                    return;
                }
                resolve(Object.values(row)[0]);
            });
        });
    },
    insertIntoChannelCommand: function(cause, addition){
        return new Promise(function(resolve){
            let column;
            switch (cause){
                case 'channel': column = 'channel_id'; break;
                case 'command': column = 'command_name'; break;
                default: resolve(-1); return;
            }
            let sql = 'INSERT INTO CHANNEL_COMMAND (channel_id, command_name) SELECT channel_id, command_name FROM CHANNEL CROSS JOIN COMMAND WHERE ' +column+ ' = ? AND command.dev_only = 0';
            db.run(sql, [addition], function(err){
                if (err){
                    console.error(err.message);
                    resolve(err.message);
                    return;
                }
                resolve(1);
            });
        });
    },
    
    setToken: function(token){
        let sql = 'UPDATE IMPORTANT SET token = ?';
        db.run(sql, [token], function(err){
            console.log(err);
        });
    }
};

function insertNewUser(id, name, points, snakeHighscore){
    let sql = 'INSERT INTO USER(id, username, points, snake_highscore) VALUES (?, ?, ?, ?)';
    db.run(sql, [id, name, points, snakeHighscore], function(err){
        if (err) 
            return console.error(err.message);
        console.log('New user inserted: ' + name);
    });
}

function checkIfUserExists(id){
    return new Promise(function(resolve, reject){
        let sql = 'SELECT EXISTS (SELECT * FROM USER WHERE id = ?) AS result';
        db.get(sql, [id], (err, row) => {
            if (err){
                reject(err.message);
            }

            if (row.result === 1){
                resolve(true);
            } else {
                resolve(false);
            }
        });  
    });
    
}