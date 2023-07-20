// Trying to understand my own framework to build macros on

var testArray = [
    {dur:100, text:"the"},
    {dur:200, text:"quick"},
    {dur:300, text:"brown"},
    {dur:400, text:"fox"},
    {dur:500, text:"jumps"},
    {dur:600, text:"over"},
    {dur:700, text:"the"},
    {dur:800, text:"lazy"},
    {dur:900, text:"dog"},
    {dur:1000, text:"hi"}
];

const iterate = (arr, indx = 0)=>{
    if(!arr[indx]) return;
    console.log(arr[indx].text);
    setTimeout(()=>iterate(arr, indx+1), arr[indx].dur);
}

iterate(testArray);