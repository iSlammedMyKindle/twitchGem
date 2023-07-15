//Dump of stuff that I used to test events
import webEvents from "../webServer.mjs";

var testFail = false;
webEvents.on('changeconfig', ({params, callback})=>{
    console.log("test", params[1]);
    if(testFail) callback(false, new Error("this thing bad"));
    else callback(true);

    testFail = !testFail;

    console.log('alreadyfullfill', callback(true));
});

//  "Changed config to " + params[1]