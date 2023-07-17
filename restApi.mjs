/* Made by iSlammedMyKindle in 2023!
    I've decided to make the rest api separate from the web UI. 
    This should make it so that if there is an alternate interface someone wants to use, it can be utilized instead
    For example, I think this would work great with streamdeck buttons, so I might use the elements here to make calls to the UI
*/

import http from "http";
import { EventEmitter } from "node:events";

const apiEmitter = new EventEmitter();

const availableCommands = ["config", "panick", "reload"];

const restApi = http.createServer((req, res)=>{
    const params = req.url.substring(1).split('/');
    if(availableCommands.indexOf(params[0]) > -1){
        //Send an event to the emitter that has a callback so we can confirm the action was taken
        let requestCompleted = false;
        res.setHeader('Content-Type', "text/plain");
        apiEmitter.emit(params[0], { params, callback:(fulfilled = false, msg = '')=>{
            // Fail the function if we've already processed the request to the user in case this is used in more than one place.
            if(!requestCompleted) requestCompleted = true;
            else return false;

            if(fulfilled){
                res.statusCode = 200;
                res.write(JSON.stringify({statusCode: 200, msg}));
                res.end();
                return true;
            }

            // There was an error, print it to the response
            res.statusCode = 500;
            res.write(JSON.stringify({ statusCode: 500, msg }));
            res.end();
        }});

        setTimeout(()=>{
            if(requestCompleted) return;

            //This failed to get processed somehow, tell the api we timed out
            requestCompleted = true;
            res.statusCode = 500;
            res.write(JSON.stringify({statusCode: 500, msg: "Server timeout - nothing processed the api call for some reason :/"}));
            res.end();
        }, 1000);
    }

    // We don't support this command
    else{
        res.statusCode = 404;
        res.write(JSON.stringify({statusCode:404, msg:"Command not found"}));
        res.end();
    }
});

// Create events for when a certain task is required to happen. When the events are emitted, we could send a function to callback to the server if data is required to be retrieved.
restApi.listen(9004);
console.log('twitchGem rest api has been started');

export default apiEmitter;