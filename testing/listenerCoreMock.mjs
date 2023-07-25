import { WebSocket, WebSocketServer } from "ws";
var listenerCoreSocket;
var wsListener;

// Dummy listenerCore server
const listenerCore = new WebSocketServer({ port:9001 });
listenerCore.on('connection', ws=>{
    listenerCoreSocket = ws;
    ws.on('message', buff=>console.log('(listenerCore)', buff.toString()));

    // websocket listener
    wsListener?.close();
    wsListener = new WebSocket("ws://localhost:9005");
    wsListener.on('open', ()=>{
        console.log('Connected to websocket api');
        wsListener.send(JSON.stringify(["button", "config", "panick"]));
    });
    wsListener.on('message', buff=>console.log('(Websocket server)', JSON.parse(buff.toString())));
});

// Abstract mocks for listenerCore; export them to the node console and run the server in VSCode debug
const sendText = (text, user = 'islammedmykindle')=>listenerCoreSocket.send(JSON.stringify({ channel:'#islammedmykindle', user, text}));

export { sendText };