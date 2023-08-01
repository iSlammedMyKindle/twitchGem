# tGem

**tGem** - or **T**witch **G**amepad **Em**ulator, assists in letting a twitch audience control the streamer's game on twitch! It is highly configurable, and capable of adapting to any application that makes use of a standard XBox 360 controller.

## Features

* Every button (except the guide button) can be pressed through twitch chat (`!a !b !start !l !r`, etc)
* __configuration files__ - any combination of buttons can be turned on or off, as well as renamed so it's easier to understand what it will do on stream (e.g `!a` can be turned into `!jump`, the B button can be left out entirely)
* Macros - build your own custom commands to press a series of buttons in sequence. This could be used for example to restart a level, perform a shoryuken, or put tetrominoes down randomly in a game of tetris
* OBS HUD - connect to the web-based HUD elements to help twitch figure out what's going on!
    * controller UI - a virtual xbox controller that displays button presses made by twitch
    * command list - all the available commands the streamer setup in advance
    * macro notifications - did a twitch user run a macro? Let the audience know whodunit
* Panick button - stream getting a little rambunctious? Hit this button and all commands will be ignored! Anything being pressed (including macros) will shut down on the spot
* load configs in real time - with the press of a button on a stream deck, the next game to be played can be setup instantly. Made edits to the config? You can reload that too.

## Developer features

* **REST api** - everything, from changing/reloading the active game config to hitting the panick button, to even simulating button presses or macros, the rest api is your main source for doing all of that. An ideal configuration is making use of a __stream deck__ to activate a feature, or in the future, a webpage that also has these features
* **Websocket interface** - there is a dedicated websocket api that listens to when a config is changed, buttons are pressed, the panik button was hit, or even when a macro was run. You could even replace the connection to twitch with something completely different, since that too is communicating through a (separate) direct websocket connection. The connection to a gaming PC (godotGem) also has it's own websocket communication, so theoretically there could be a middle man that could assist with things before they even make it to the PC.
* **Spread all the components out** - not everything has to run on one PC. Everything about this application can be run on many different devices at a time, each of these can be loaded onto someting different:
    * HUDs (controller, commands list, notifications)
        * You can have any number of these running at one time. For example you can run multiple controller HUDs, one for your personal view and one for twitch.
    * tGem
    * Rest API
    * godotGem
    * twitchListenerCore
* **customizable assets** - all assets for the controller were built using SVGs. You can change skin of the controller simply by editing the file through something like inkscape, same for all the buttons. each asset is 1000px x 1000px

## Technology

tGem was made using a large connection of independently connected modules. The main thing connecting it all together is actually **websockets** and **rest apis**, keeping everything very modular and customizable.

tGem doesn't actually handle the xbox controller emulation, that's delegated to another project: [godotGem](https://github.com/iSlammedMyKindle/godotGem), specifically the server half of it. godotGem at it's core uses the (soon to be renamed) [ViGEm.NET](https://github.com/ViGEm/ViGEm.NET) created by nefarius. It's an excellent project that's been used everywhere, it's worth checking out on it's own.

Speaking of which, godotGem is used for two aspects: the streamer's controller (client) (gdScript), and accepting inputs from tGem. (server). This makes use of the fact that godotGem accepts multiple inputs from different clients at once, meaning __everyone connected is basically player 1__. Alternatively, if the streamer decided to plug in a controller first, *then* started tGem, twitch could be a player 2 in the game.

Connections to twitch are *also* not part of this project, technically. That's handled through `twitchListenerCore`, a service that can be used to talk to multiple clients that want access to twitch all at once. An example use case is the avatar used on the [islammedmykindle](https://twitch.tv/islammedmykindle) twitch channel; it connects to this service to listen to channel point redemptions. Add that, plus tGem, plus maybe even a bot or a custom notification and `twitchListenerCore` becomes an everything module that works entirely on it's own, and other apps don't need to handle extra twitch logic directly.

The HUDs for the stream were written using HTML, javaScript & CSS. Each are individual components that work independently of eachother. There were no extra frameworks that were used to build the components, but they can easily be expanded upon or be replaced. They only listen to websocket communications that make sense for that HUD.

## Dependencies

* [godotGem](https://github.com/iSlammedMyKindle/godotGem) - the server for handling twitch controller input, the client for handling streamer inputs.
    * A steam deck is a good recommended device to use for controller inputs.
    * Otherwise a standard laptop (windows/linux) with a controller will also do fine
* [twitchListnerCore](https://github.com/iSlammedMyKindle/twitchListenerCore) - separate server to connect tGem to twitch
* `OBS` - or another streaming application that accepts webpages for a video source

# Setup

## **DISCLAIMERS**

**This project is considered experimental** - installing & running is not exactly easy right now and requires some basic administration / power user knowledge. If there is enough interest in the project, this will likely be the first thing to be worked on.

**THIS WAS NOT MADE WITH SECURITY IN MIND!!!** - Websocket and rest api communications were done in http (insecure). There is also **absolutely nothing** stopping people using these maliciously if the ports were exposed or forwarded.
* The connection to twitch specifically is the concerning if you wish to not have anyone sock-puppet you.
* The rest api has no security or verification on it, that means someone can have direct controll over controller buttons without interfacing with twitch. They can also reload configs and abuse your harddrive.
* anyone with access to websockets can view the huds for themselves; with enough connections tGem could experience either a DDOS, CPU, or RAM overflow

**This software is not responsible for practices users need to remember to stay safe - use the software at your own risk**

-------


With all that scary stuff out of the way, if you're game, lets begin!

## twitchListenerCore

For now, this requires you make a twitch application. You can do that through the twitch developer portal.

1. clone twitchListnerCore onto the desired machine
1. Insert your twitch channel, client ID, and secret into [this file](https://github.com/iSlammedMyKindle/twitchListenerCore/blob/master/config.example.json) and rename it to `config.json`
1. run `node index.mjs`, if you're on a desktop, it will open your browser and ask for twitch authentication. Once authenticated, it should be running!

## godotGem

[Use these instructions](https://github.com/iSlammedMyKindle/godotGem#manual-install), if these don't work for you, you are welcome to watch my cringy and unlisted youtube video about it!

You will need setup both a client & server. The client being a laptop with a controller, or a steam deck. There is only a windows godotGem server at this time.

## tGem

If any service above is using anything other than the local machine, you can change where tGem points to both services using [serverConfig.json](./serverConfig.json).

launch tGem using `node index.mjs`. If you don't want to use twitch (e.g just using the REST API), add the `--no-twitch` flag. If you don't want to use the default HUDs and want to host something else, you can turn it completely off with the `--no-webserver` flag.

If you've gotten this far, *great work!* Twitch chat can now control your game... almost

## Rest API

There is no UI yet for changing configurations. At launch, there is no config loaded to prevent command abuse. This means the only way to load a config is through the **REST API**. To use these, either navigate to these using a web browser, or use a stream deck to make one of the calls.

All commands for the API are reached through port `9004` - an example call may look like this:

```
http://localhost:9004/config/default
```

### `/config/<configname>`

Change to a pre-made config. Configs are located in `./configs`, and there are a couple of examples to help you get started.

The name of the config depends on the file name, without `.json`

There is one config that is the base of all the others and is baked into the app: `default` (`/config/default`) - this will give you each button on the xbox controller as a separate command, with a delay of 1 second per-button press.

Redeems have their own counterpart to this: `redeemdefault`

**If you run this, twitch will now be able to control your game!!!**

### `/panick`

Stops everything, including button presses and macros. If there are any configs being used for either redeems or commands, they are cleared out.

**Keep this at bay, as chaos will inevitably ensue**

### `/reload`

Reload all configs. If a new one was created, or an existing one got changed, this will reload everything. You may need to run `/config` to properly reload a config that's already being used

### `/reload/<configname>`

Reload a specific config instead of all of them; makes sense to do if the config in question is very large.

### `/trigger/<type>/<command>`

Where:

* `type` is either `button`, or `redeem` (channel points)
* `command` is the label associated with a command of the active configuration (e.g `jump`)

Simulate a button press or macro just like it would have happened if twitch chat ran it. If twitch ran `!jump`, the api can run `/trigger/button/jump`.

Useful for demonstrating how a redeem or button works to the audience before they get to use it, or can be used programatically from an external source.

### `/query`

Obtains both the button and redeem configs in their full. Used interally to update HUDs in real time if a refresh happens

# License

<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.