/* Made by iSlammedMyKindle in 2023!
    Connect twitch to godotGem and use it as as general purpose controller.
    Use a basic web server to be the GUI and display basic settings such as controller inputs
    I wanna also make a rest api service to have things like a kill switch and methods to switch configurations
*/

//Modules for both connecting to listenerCore and providing events in real time to other places
import {WebSocket} from "ws";
import serverConfig from "./serverConfig.json" assert {type:'json'};
// import http from "http";
import fs from "fs/promises";
import restApi from "./restApi.mjs";
import wsEvtEmitter from "./webSocketApi.mjs";

// Dynamically import the web server as long as it's not disabled
if(process.argv.indexOf('--no-webserver') > -1) console.warn("Webserver was turned off - skipping launch");
else import("./webServer.mjs");

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

// Upon pressing a button, this is the template being followed to unpress the button later, send info to websockets and print to console what's going on.
class buttonPressObj{
    /**
     * 
     * @param {Number | Object} btn - specific integer of what should be pressed, or in the case of the joystick, an object that has data to push the joystick in different directions
     * @param {String} label - The key this button will correlate to in `pressDownIndex`. Used in configs to make it easier to remember what action is done instead of a specific button being enabled/disabled
     * @param {Boolean} pressed - Is the button pressed or not?
     * @param {String} user - name of the person that pushed the button.
     * @param {Boolean} random - randomly assign a time to press and release the button based on `duration` milliseconds
     * @param {Number} duration - amount of time between a press and a release
     */
    constructor({user = "N/A", btn, btnKey, label, duration = 1000, pressed = true, random = false}){
        this.pressed = pressed;
        this.btn = btn;
        this.btnKey = btnKey;
        this.label = label || btn;
        this.user = user;
        this.duration = random ? Math.floor(Math.random() * duration) : duration;
    }
}

const configs = {};

// config being used at the moment; at start it's blank so that when it launches, people aren't just spamming commands while you setup
let activeConfig = {};
let activeRedeems = {};

// Player indexing - keeps track of players so that they don't spam a single button
const playerButtonIndex = {};

// Press down indexing - everyone is going to wanna press down the same button at some point. Instead of letting go after 1 second for all button presses, have a countdown in order to wait to lift that virtual thumb up
const pressDownIndex = {};

// Macros: a sequence of button presses all in line. This will store upcoming macros and store the active macro sequence
var pendingMacros = [];
var macroLock;

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
 * scan for configs (basically anything with .json at the end)
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
    const joyArray = joystickData[joyObj.stickLR * 1];
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

function buttonRelease({btn, label, user}){
    // Get rid of this reference so we can press the button again
    delete playerButtonIndex[user][label];
    if(pressDownIndex[label] > 0) pressDownIndex[label]--;

    // Set to 0 if we went negative
    if(pressDownIndex[label] < 0) pressDownIndex[label] = 0;

    if(pressDownIndex[label] === 0){
        // Joystsick data will be handled differently over a standard button
        var released = false;

        if(btn?.type == "joystick") released = joyRelease(btn);
        else{
            released = true;
            godotGemServer.send([0, btn, 0]);
        }
        
        // broadcast release
        if(released){
            arguments[0].pressed = false;
            console.log(arguments[0]);
            wsEvtEmitter.emit("button", { event: "button", data: arguments[0]});
        }
    }
}

/**
 * Presses the button based on if whether or not someone is already pressing the button or not. If someone is then the button press is instead incremented.
 * @param {btn, label, user, duration, pressed} param0 - an object containing all the data needed to press said button
 * @returns Promise - When the button releases, a signal comes back. This doesn't track if the signal was actually sent, only when the timer is up and we're about to execute the button release
 */
function buttonPress({ btn, label, user, duration, pressed }){
    // If the user is already pressing the button, ignore it until their time is up. They can then press it again.
    if(!playerButtonIndex[user]) playerButtonIndex[user] = {};
    
    if(playerButtonIndex[user][label]) return;

    if(pressDownIndex[label]) return pressDownIndex[label]++;

    // Determine if we're using a joystick or not
    if(btn?.type == "joystick"){
        // Record joystsick data based on its index
        const joyArray = joystickData[btn.stickLR * 1];

        // Non 0 data is never recorded, only when we release the joystick do we go back to 0
        if(btn.data[0]) joyArray[0] = btn.data[0];
        if(btn.data[1]) joyArray[1] = btn.data[1];

        // Send the joystick data (string on purpose over an array of bytes because this data is more complicated)
        godotGemServer.send(JSON.stringify([btn.index, ...joyArray]));
    }

    // Otherwise it's a button, PRESS THE BUTTON (array of bytes)
    else godotGemServer.send([0, btn, 255 ]);

    // Broadcast button press
    console.log(arguments[0]);
    wsEvtEmitter.emit("button", { event: "button", data: arguments[0]});
    pressDownIndex[label] = 1;

    // Set a time to release the button and delete the timeout reference from the object. If this is the last person pressing the button, let go
    return new Promise((res)=>{
        playerButtonIndex[user][label] = setTimeout(()=>{
            buttonRelease(arguments[0]);
            res(true);
        }, duration);
    });
}

/**
 * Let go of all buttons
 */
function releaseAllButtons(){
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
        const redeemInfo = activeRedeems ? controllerMapping[activeRedeems[button]] : controllerMapping[button];
        // Release the button
        if(btnInfo?.type == "joystick") joyRelease(btnInfo);
        else if(redeemInfo?.type == "joystick") joyRelease(redeemInfo);

        else godotGemServer.send([0, button*1, 0]);

        delete pressDownIndex[button];
    }
}

/**
 * Run through the selected macro. Once it's done optionally go through the next on that's inside `pendingMacros`.
 * @param {Object} macroParams - list of moves to execute until all are completed. Should only have button data, not shortcut names
 * @param {Boolean} doNextMacro - should the next macro be run once this one is finished?
 */
async function iterateThroughMacro(macroParams, doNextMacro = true){
    if(!macroLock) macroLock = true;
    else return console.error("Macro already running! (Is there a trailing macroLock?)");

    // Go through each item in the macro
    for(const press of macroParams.data){
        // Assemble the button data
        if(!macroLock){
            // Something from the outside broke the macro, STOP! (e.g panick signal)
            console.warn("STOPPING MACRO!!! lock was set to false");
            break;
        }
        const pressObj = new buttonPressObj({ user: macroParams.user, label: press.key, btnKey: press.key, btn:controllerMapping[press.key], duration: press.duration, random: press.random});
        await buttonPress(pressObj); // Wait until the button is un-pressed to continue
    }

    if(macroLock && doNextMacro){
        macroLock = false;
        const newMacro = pendingMacros[0];
        if(!newMacro) return; // No more macros to run through!

        pendingMacros.shift();

        iterateThroughMacro(newMacro);
    }
}

/**
 * Parse button inputs from either chat or as a redeem. Depending on which one will determine where keys are matched up to
 * @param {String} input - the controller input, can be something like "a" or "do a barrel roll" in the case of a redeem
 * @param {String} user - user that requested the button
 * @param {String} pressType - either "button" or "redeem"
 */
function parseButton(input = "", user = "[anonymous?]", pressType = "button"){
    // Landing place depending on if we're pressing a button normally or doing a redeem
    const targetConfig = pressType == "button" ? activeConfig : activeRedeems;

    const activeConfOption = targetConfig ? targetConfig[input] : undefined;
    const key = activeConfOption?.key || activeConfOption;
    var duration = activeConfOption?.duration || 1000;

    const moveObj = new buttonPressObj({ btn: targetConfig ? controllerMapping[key] : controllerMapping[input], btnKey: key || input, label: input, user, duration, random: activeConfOption?.random });

    //Send inputs to godotGem 
    if(moveObj.btn !== undefined){
        if(macroLock){
            const msg = "Ignoring @"+user+"'s button press to focus on macro...";
            listenerCore?.send(JSON.stringify({action:"message", text: msg}));
            console.log(msg);
        }

        else buttonPress(moveObj);
    }
    // If this fails, there's no button being corresponded (lack of key), a macro may be run instead if that's what it is. Instead of using moveObj.btn, we use targetConfig
    else if(activeConfOption?.type == "macro"){
        // Setup the macro
        const macroData = { user: moveObj.user, data: activeConfOption.data };

        //Store for later
        if(macroLock) pendingMacros.push(macroData);
        else{
            // Stop all movements, initiate the macro
            releaseAllButtons();
            iterateThroughMacro(macroData);
        }
    }
}

// Attempt to connect to godotGem on launch. If that succeeds, connect to twitchListenerCore
const godotGemServer = new WebSocket('ws://'+serverConfig.godotGem+':9090');
var listenerCore;

godotGemServer.on('open', ()=>{
    console.log("Connected to godotGem server!");

    if(process.argv.indexOf('--no-twitch') > -1){
        console.warn("Twitch api was skipped; you can still use the rest api to send button commands");
        return;
    }

    listenerCore = new WebSocket('ws://'+serverConfig.twitchListenerCore+':9001');
    listenerCore.on('open', ()=>{
        console.log('twitchListenerCore connected!');
        // Tell listenerCore to give us messsage events
        listenerCore.send(JSON.stringify(['message', 'redeem']));
    });

    listenerCore.on('message', buff=>{
        // This is where twitch messages are converted to button presses. When we get something, we first send it to godotGem, then we broadcast the activity to other things listening
        const resJson = JSON.parse(buff.toString());

        // We only need the message event right now, as long as we get it we're good to send controller inputs
        if(resJson.accepted) console.log('Now listening to ', resJson.accepted);
        if(resJson.rejected) console.error('twitchListenerCore rejected these events:', resJson.rejected);

        // Figure out if controller inptus are being requested, can either be from chat (button) or through redeems

        var inputType;

        if(resJson.text && resJson.text[0] == "!") inputType = "button";
        else if (resJson.title) inputType = "redeem";
        else return;

        parseButton(inputType == "button" ? resJson.text.substring(1) : resJson.title, resJson.user, inputType);
    });
});

godotGemServer.on('message', buff=>{
    console.log('Vrr', [...buff]);
    // Send vibration event as part of an external websocket
});

// Configure the rest api

// If a change is requested, alter the commands so that we use the new config for games
restApi.on('config', ({params, callback})=>{
    // Second parameter is the config file name (without the JSON)
    if(!configs[params[1]] && params[1] !== "default" && params[1] !== "redeemdefault") return callback(false, "Couldn't find the config for: "+params[1]);

    const isRedeem = configs[params[1]]?._redeem;
    
    if(params[1] == "default") activeConfig = undefined; // For some reason I can't use "delete", it's acting like it's in strict mode
    else if(params[1] == "redeemdefault") activeRedeems = undefined;
    else if(isRedeem) activeRedeems = configs[params[1]];
    else activeConfig = configs[params[1]];

    // Send to the things
    const resMsg = "Changed the "+(isRedeem ? "active redeems" : "config")+" to: "+params[1];
    console.log(resMsg);
    callback(true, resMsg);

    // Send something to websockets that we've changed the config - send the config too
    wsEvtEmitter.emit("config", { event:"config", configName: params[1], config: configs[params[1]] });

    // TODO: send messages to display the current config 
});

// Completely shut it all down - if something happens, use this to prevent any inputs from going through
restApi.on('panick', ({ callback })=>{

    releaseAllButtons();

    activeConfig = {}; // Empty config so buttons don't go through
    activeRedeems = {};

    // Cancel the macro
    macroLock = false;

    const res = "Ignoring all button commands!!!";
    console.log(res);
    listenerCore?.send(JSON.stringify({action:"message", text: res}));

    callback(true, res);

    // Send a signal to websockets telling the controller is disabled
    wsEvtEmitter.emit("panick", { event:"panick" });
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

// Press a button or initiate a macro
restApi.on('trigger', async ({params, callback})=>{

    if(!(params[1] && params[2])) return callback(false, "Too few arguments. First must be either \"button\" or \"redeem\", the second should be a valid controller input or macro depending on the loaded configurations");

    parseButton(params[2], "api", params[1]);

    const res = "Now processing the "+ params[1] + " command for: " + params[2];
    console.log(res);
    callback(true, res);
});

// Find out what configs are currently being used
restApi.on('query', async ({ callback })=>{
    callback(true, {config:(activeConfig && Object.keys(activeConfig).length ? activeConfig : undefined), redeems: activeRedeems && Object.keys(activeRedeems).length ? activeRedeems : undefined});
})