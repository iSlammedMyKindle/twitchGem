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

// This was originally a flat object, 
class joystick {
    stickLR;
    index = 15;
    type = "joystick";
    data = [];
    constructor(data, stickLR = false){
        this.data = data;
        // If this is the left stick, stick with the original index. Otherwise add a couple to equal the right stick
        // It's two because godotGem will use 15 for Left stick X, + 1 for Y, etc
        this.index += stickLR * 2;
        this.stickLR = stickLR;
    }
}

// Scan for configs (basically anything with .json at the end)
const configs = {};
let activeConfig;

// Player indexing - keeps track of players so that they don't spam a single button
const playerButtonIndex = {};

// Press down indexing - everyone is going to wanna press down the same button at some point. Instead of letting go after 1 second for all button presses, have a countdown in order to wait to lift that virtual thumb up
const pressDownIndex = {};

// Record current information about joysticks. When the "press" is finished, not all the data is removed and instead just some of the joystick data in case someone is pushing upwards and another is moving right
const joystickData = [
    [0, 0], // Left stick
    [0, 0] // Right stick
]

// Pasted from the godotGem client. We need these to send the correct button inputs to the emulated controller
const controllerMapping = {
    // Buttons
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

    // Triggers
    "tl":19,
    "tr":20,

    // Joysticks
    "sll": new joystick([-32767]),
    "slr": new joystick([32767]),
    "slu": new joystick([,32767]),
    "sld": new joystick([,-32767]),
    "srl": new joystick([-32767], 1),
    "srr": new joystick([32767], 1),
    "sru": new joystick([,-32767], 1),
    "srd": new joystick([,-32767], 1),
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

/**
 * Dedicated function to release an angle of the joystick. It's an everything function, so it checks if the current position is active, then sends a godotGem messasge to release it
 * Makes use of the `joystickData` global
 * @param {*} joyObj - joystick object
 * @returns Bool - if we released the joystick position and sent the data over to godotGem
 */
function joyRelease(joyObj){
    var released = false;

    // If this is not the same number associated with this joystick position, we should ignore it so the current position isn't cancelled out
    const joyArray = joystickData[joyObj.stickLR*1];
    for(let i = 0; i < joyObj.data.length; i++){
        if(!joyObj.data[i]) continue;

        // release the joystick in this position
        if(joyArray[i] == joyObj.data[i]){
            joyArray[i] = 0;
            released = true;
        }
    }

    if(released) godotGemServer.send(JSON.stringify([joyObj.index, ...joyArray]));
    return released;
}

function buttonRelease(moveJson){
    // Get rid of this reference so we can press the button again
    delete playerButtonIndex[moveJson.user][moveJson.label];
    if(pressDownIndex[moveJson.label] > 0) pressDownIndex[moveJson.label]--;

    // Set to 0 if we went negative
    if(pressDownIndex[moveJson.label] < 0) pressDownIndex[moveJson.label] = 0;

    if(pressDownIndex[moveJson.label] === 0){
        // Joystsick data will be handled differently over a standard button
        var released = false;

        if(moveJson.btn?.type == "joystick") released = joyRelease(moveJson.btn);
        else{
            released = true;
            godotGemServer.send([0, moveJson.btn, 0]);
        }
        
        // broadcast release
        if(released){
            moveJson.pressed = false;
            console.log(moveJson);
        }
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
        const activeConfOption = activeConfig? activeConfig[twitchPhrase] : undefined;
        var duration = activeConfOption?.duration,
            key = activeConfOption?.key || activeConfOption;
        
        if(activeConfOption?.random && duration) duration = Math.floor(Math.random() * duration);

        const moveJson = { btn: activeConfig ? controllerMapping[key] : controllerMapping[twitchPhrase], label: twitchPhrase, user: resJson.user, pressed: true, duration };

        if(moveJson.btn !== undefined){
            //Send inputs to godotGem

            // If the user is already pressing the button, ignore it until their time is up. They can then press it again.
            if(!playerButtonIndex[resJson.user]) playerButtonIndex[resJson.user] = {};
            if(!playerButtonIndex[resJson.user][moveJson.label]){
                // Set a time to release the button and delete the timeout reference from the object. If this is the last person pressing the button, let go
                playerButtonIndex[resJson.user][moveJson.label] = setTimeout(()=>buttonRelease(moveJson), duration || 1000);

                if(!pressDownIndex[moveJson.label]){
                    // Determine if we're using a joystick or not
                    if(moveJson.btn?.type == "joystick"){
                        // Record joystsick data based on its index
                        const joyArray = joystickData[moveJson.btn.stickLR * 1];

                        // Non 0 data is never recorded, only when we release the joystick do we go back to 0
                        if(moveJson.btn.data[0]) joyArray[0] = moveJson.btn.data[0];
                        if(moveJson.btn.data[1]) joyArray[1] = moveJson.btn.data[1];

                        // Send the joystick data (string on purpose over an array of bytes because this data is more complicated)
                        godotGemServer.send(JSON.stringify([moveJson.btn.index, ...joyArray]));
                    }
                    // Otherwise it's a button, PRESS THE BUTTON (array of bytes)
                    else godotGemServer.send([0, moveJson.btn, 255 ]);

                    // Broadcast button press
                    console.log(moveJson);
                    pressDownIndex[moveJson.label] = 1;
                }
                else pressDownIndex[moveJson.label]++;
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
restApi.on('config', ({params, callback})=>{
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

    // Delete all user button presses
    for(const user in playerButtonIndex){
        for(const timeoutId in playerButtonIndex[user]){
            clearTimeout(playerButtonIndex[user][timeoutId]);
            delete playerButtonIndex[user][timeoutId];
        }
    }

    // Release all buttons
    for(const button in pressDownIndex){
        // Obtain button information
        const btnInfo = activeConfig ? controllerMapping[activeConfig[button]] : controllerMapping[button];
        // Release the button
        if(btnInfo?.type == "joystick") joyRelease(btnInfo);
        else godotGemServer.send([0, button*1, 0]);

        delete pressDownIndex[button];
    }

    activeConfig = {}; // Empty config so buttons don't go through

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