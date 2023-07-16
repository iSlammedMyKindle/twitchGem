/* Made by iSlammedMyKindle in 2023!
    Connect twitch to godotGem and use it as as general purpose controller.
    Use a basic web server to be the GUI and display basic settings such as controller inputs
    I wanna also make a rest api service to have things like a kill switch and methods to switch configurations
*/

//Modules for both connecting to listenerCore and providing events in real time to other places
import {WebSocket, WebSocketServer} from "ws";
import serverConfig from "./serverConfig.json" assert {type:'json'};
// import http from "http";
import fs from "fs/promises";
import restApi from "./restApi.mjs";

// Scan for configs (basically anything with .json at the end)
const configs = {};
let activeConfig;

// Player indexing - keeps track of players so that they don't spam a single button
const playerButtonIndex = {};

// Press down indexing - everyone is going to wanna press down the same button at some point. Instead of letting go after 1 second for all button presses, have a countdown in order to wait to lift that virtual thumb up
const pressDownIndex = {};

// Pasted from the godotGem client. We need these to send the correct button inputs to the emulated controller
const controllerMapping = {
	"up":0,
	"down":1,
	"left":2,
	"right":3,
	"start":4,
	"select":5,
	"sl":6,
	"sr":7,
	"l":8,
	"r":9,
	"guide":10,
	"a":11,
	"b":12,
	"x":13,
	"y":14,
}

/**
 * load a configuration json file, or all of them if one isn't specified
 * @param {String} config - Name of the config under the ./configs directory
 */
async function loadConfigs(config){
    //  Reject any backdoors if someone somehow gained access to the rest api
    if(config?.indexOf('.') > -1 || config?.indexOf('/') > -1) throw new Error('Invalid config name (must be "flat", no .json, dots or slashes)');

    if(config){
        const buff = await fs.readFile('./configs/'+config+'.json');
        configs[config] = JSON.parse(buff.toString());
        console.log(config + " was reloaded");
        return;
    }

    for(const file of await fs.readdir('./configs')){
        if(file.indexOf('.json') > -1){
            fs.readFile('./configs/'+file).then(e=>{
                configs[file.split('.json')[0]] = JSON.parse(e.toString());
                console.log(file, 'has been loaded');
            });
        }
    }
}

loadConfigs();

function buttonRelease(moveJson){
    // Get rid of this reference so we can press the button again
    delete playerButtonIndex[moveJson.user][moveJson.btn];
    if(pressDownIndex[moveJson.btn] > 0) pressDownIndex[moveJson.btn]--;

    // Set to 0 if we went negative
    if(pressDownIndex[moveJson.btn] < 0) pressDownIndex[moveJson.btn] = 0;

    if(pressDownIndex[moveJson.btn] === 0){
        godotGemServer.send([0, moveJson.btn, 0]);
        moveJson.pressed = false;
        
        // broadcast release
        console.log(moveJson);
    }
}

// Attempt to connect to godotGem on launch. If that succeeds, connect to twitchListenerCore
const godotGemServer = new WebSocket('ws://'+serverConfig.godotGem+':9090');
godotGemServer.on('open', ()=>{
    console.log("Connected to godotGem!");
    const listenerCore = new WebSocket('ws://'+serverConfig.twitchListenerCore+':9001');
    listenerCore.on('open', ()=>{
        console.log('twitchListenerCore connected!');
        // Tell listenerCore to give us messsage events
        listenerCore.send(JSON.stringify(['message']));
    });

    listenerCore.on('message', buff=>{
        // This is where twitch messages are converted to button presses. When we get something, we first send it to godotGem, then we broadcast the activity to other things listening
        const resJson = JSON.parse(buff.toString());

        // We only need the message event right now, as long as we get it we're good to send controller inputs
        if(resJson.accepted) console.log('Now listening to ', resJson.accepted);
        if(resJson.rejected) console.error('twitchListenerCore rejected these events:', resJson.rejected);

        // Figure out if controller inptus are being requested
        if(!resJson.text || resJson.text && resJson.text[0] !== "!") return;

        const twitchPhrase = resJson.text.substring(1);
        const moveJson = { btn: activeConfig ? controllerMapping[activeConfig[twitchPhrase]] : controllerMapping[twitchPhrase], label: twitchPhrase, user: resJson.user, pressed: true };

        if(moveJson.btn !== undefined){
            //Send inputs to godotGem

            //If the user is already pressing the button, ignore it until their time is up. They can then press it again.
            if(!playerButtonIndex[resJson.user]) playerButtonIndex[resJson.user] = {};
            if(!playerButtonIndex[resJson.user][moveJson.btn]){
                // Set a time to release the button and delete the timeout reference from the object. If this is the last person pressing the button, let go
                playerButtonIndex[resJson.user][moveJson.btn] = setTimeout(()=>buttonRelease(moveJson), 1000);

                if(!pressDownIndex[moveJson.btn]){
                    godotGemServer.send([0, moveJson.btn, 255 ]);
                    //Broadcast button press
                    console.log(moveJson);
                    
                    pressDownIndex[moveJson.btn] = 1;
                }
                else pressDownIndex[moveJson.btn]++;
            }
        }
    });
});

godotGemServer.on('message', buff=>{
    console.log('Vrr', buff.toString());
    // Send vibration event as part of an external websocket
});

// Configure the rest api

// If a change is requested, alter the commands so that we use the new config for games
restApi.on('changeconfig', ({params, callback})=>{
    // Second parameter is the config file name (without the JSON)
    if(!configs[params[1]] && params[1] !== "default") return callback(false, "Couldn't find the config for: "+params[1]);
    
    if(params[1] == "default") activeConfig = undefined; // For some reason I can't use "delete", it's acting like it's in strict mode
    else activeConfig = configs[params[1]];

    const resMsg = "Changed the config to: "+params[1];
    console.log(resMsg);
    callback(true, resMsg);

    // Send something to websockets that we've changed the config - send the config too
});

// Completely shut it all down - if something happens, use this to prevent any inputs from going through
restApi.on('panick', ({ callback })=>{
    activeConfig = {}; // Empty config so buttons don't go through

    // Delete all user button presses
    for(const user in playerButtonIndex){
        for(const timeoutId in playerButtonIndex[user]){
            clearTimeout(playerButtonIndex[user][timeoutId]);
            delete playerButtonIndex[user][timeoutId];
        }
    }

    // Release all buttons
    for(const button in pressDownIndex){
        // Release the button
        godotGemServer.send([0, button*1, 0]);
        delete pressDownIndex[button];
    }

    const res = "Ignoring all button commands!!!";
    console.log(res);
    callback(true, res);

    // Send a signal to websockets telling the controller is disabled
});

// Reload a config
restApi.on('reload', async ({params, callback})=>{
    // There's no exception handling in the reload function, so we're doing it here
    try{
        await loadConfigs(params[1]);
        callback(true, params[1] ? "Reloaded "+params[1] : "Reloaded all configs");
    }
    catch(e){
        callback(false, e.toString());
    }
});