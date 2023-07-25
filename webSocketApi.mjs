/*Made by iSlammedMyKindle in 2023!
The websocket api will listen to events being emmited by the system as a whole, and broadcast those events to clients that are conencted.
This is useful for when a button is pressed, so that it can be tracked and broadcasted to UI elements. Or if the panick button is pressed, a virtual on-screen controller could disappear*/

import { WebSocketServer } from "ws";
import { EventEmitter } from "node:events";

// The more I think about it, the more I believe this will need to be constructed a lot like twitchListenerCore's websocket system
const connections = new Map();
const evtEmitter = new EventEmitter();
const validEvents = ["button", "config", "panick"];

/**
 * Send a javaSript object, this function will parse it into a string that gets sent to the client
 * @param {Object} ws - The existing connection
 * @param {Object} json - any object, it is converted in to json upon sending it
 */
const sendJson = (ws,json)=>ws.send(JSON.stringify(json));
// ...yeah basically word for word; it's good stuff though

const wsServer = new WebSocketServer({port:9005});
wsServer.on('connection', ws=>{
    // Ping back that there was a connection
    ws.send(JSON.stringify({ msg:"Connected to twitchGem websocket api!" }));
    console.log("New client was connected");
    connections.set(ws, {});

    ws.on('message', buff=>{
        try{
            var resJson = JSON.parse(buff.toString());
            if(Array.isArray(resJson)){
                const created = [];
                const rejected = [];
                const userEvents = connections.get(ws);
                for(const item of resJson){
                    if(validEvents.indexOf(item) > -1){
                        // Create the event
                        if(!userEvents[item]){
                            var newEvent = jsonObj=>sendJson(ws, jsonObj);
                            userEvents[item] = newEvent;
                            evtEmitter.on(item, newEvent);

                            created.push(item);
                        }
                    }
                    else rejected.push(item)
                }

                ws.send(JSON.stringify({created, rejected}))
            }
        }
        catch(e){
            console.error("couldn't parse JSON!", e);
        }
    });

    ws.on('close', ()=>{
        const connectionEvts = connections.get(ws);
        for(let i in connectionEvts)
            evtEmitter.off(i, connectionEvts[i]);

        connections.delete(ws);
        console.log("Disconnected from client");
    });
});

// Export the event emitter so that other portions can subscribe to and emit the respective event
export default evtEmitter;