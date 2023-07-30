// Generic code that connects to the websocket & rest apis. It assumes there are listeners on the page that will take in the basic events from websockets (jsonEvtHandlers)

const ws = new WebSocket("ws://"+location.hostname+":9005");
ws.addEventListener("open", evt=>{
    console.log("Connected to tGem", evt);
    ws.send(JSON.stringify(wsListeners));
});
ws.addEventListener("message", evt=>{
    // Grab the JSON - if it doesn't exist, or if there isn't a function for it, print the contents
    try{
        const data = JSON.parse(evt.data);
        if(jsonEvtHandlers[data.event]) jsonEvtHandlers[data.event](data);
        else console.log("tGem -", data);
    }
    catch(e){
        console.error("Something crashed!", e);
    }
});

document.addEventListener("close", ()=>ws.close());

// Query tGem to figure out if we should be showing the controller
if(window.restFetch)
    fetch("http://"+location.hostname+":9004/query").then(data=>data.json().then(window.restFetch));
else console.warn("restFetch() wasn't defined, so grabbing the active config was skipped");