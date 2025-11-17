Description of folders/files:

/lib                        -> 3rd party libraries we use
/assets                     -> should contain all texture & obj files required for our game
/src                        -> source code
/statefiles                 -> data for the scene we want to render (must be named 'scene.json' or change loading command in /src/main.js)
/index.html                 -> main html page that we are rendering
/favicon.ico                -> the icon displayed on the tab of the browser
/loading.gif                -> my sample gif for showing while the page loads

In /src
/commonFunctions.js         -> common functions used for rendering, buffers, shader creation etc
/main.js                    -> main file where we initialize all our game stuff and rendering
/myGame.js                  -> file where we can write game logic (start and constant loop)
/sceneFunctions.js          -> contains helper functions for scene manipulation (getting objects etc)
/uiSetup.js                 -> helper function for showing errors via the ui

in /src/objects 
/Cube.js                    -> cube class for rendering cubes with predefined values
/Model.json                 -> model class for rendering all our 3D models
/Plane.json                 -> plane class for rendering planes with predefined values
/CustomObject.js            -> custom class for rendering custom objects with given verts/norms/uvs/triangles



## How to run it?

- `pip install livereload`
- `python server.py`

This will open a web browser in port 8000 and run your project.


## About

This is just a template to get you started in making a game using Refinery. Feel free to edit all of this code and change whatever you'd like. And as always have fun. 
Contact Zach through discord or Dana if you have any questions.