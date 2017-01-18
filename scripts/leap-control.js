#!/usr/bin/env node

/**
 * leapcontrol.js
 *
 * Miles Fertel
 * milesfertel@college.harvard.edu
 *
 * Controls a Crazyflie Nano-Quadcopter with a Leap Motion Controller.
 */

// Declare usage in case of multiple copters
var optimist = require('optimist')
		.usage('Make a crazyflie fly with the leapmotion.\nUsage: $0 [-c <channel>]')
		.alias('c', 'channel')
		.describe('c', 'if more than one copter is found, prefer the one on this channel')
		.alias('h', 'help')
		.describe('h', 'show this help message')
		;

// Declare the channel in the case of multiple copters
var channel = optimist.argv.c;

// Require the Libraries used for this implementation
var
	_       = require('lodash'),
	Aerogel = require('../index'),
	Leap    = require('leapjs'),
	P       = require('p-promise')
	;

// Allow for quitting with Control C
function killme()
{
	throw new Error();
}

process.on('SIGINT', killme);
var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
process.on('SIGINT', bail);

// Declare a Bool for the mode of the flight program
var extreme = new Boolean(false);

// Shutdown the Quadcopter mid flight
function bail()
{
	copter.land()
	.then(function()
	{
		return copter.shutdown();
	})
	.then(function()
	{
		return process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown();
		return process.exit(1);
	})
	.done();
}

// Function called each time a frame event occurs
function leaploop(frame)
{
	// Declare a variable called hands to be counted later
	var hands = frame.hands;
	// Change Thrust
	changethrust(frame);
	// Change Pitch
	changepitch(frame);
	// Change Yaw
	changeroll(frame);
	// Hard coding extra easiness for Demo purposes, yaw won't change unless in extreme mode
	if (extreme == true)
		changeyaw(frame);
	// If a gesture is made, call the function that handles that gesture
	if (frame.gestures.length > 0)
	{
		var g = frame.gestures[0];
		if (g.type === 'circle')
			handleCircle(g, frame);
		else if (g.type === 'screenTap')
			handleScreenTap(g, frame);
	}
	// If two hands are in the frame, land the Copter
	else if (hands.length == 2)
		land();
}

// Declare the controller and enable gestures
var controller = new Leap.Controller(
{
	enableGestures: true,
});

controller.on('ready', function()
{
	console.log('leap controller ready');
});

controller.on('connect', function()
{
	console.log('leap controller connected');
});

controller.on('disconnect', function()
{
	console.log('leap controller disconnected');
});

// Each time the controller broadcasts a frame event, call leaploop
controller.on('frame', leaploop);

// Change the flight mode from extreme to normal or vice versa
function chmod()
{
	if (extreme == false)
		extreme = true;
	else
		extreme = false;
}

// Set variables to protect from over-recognition
var lastCircle = 0;
var lastTap = 0;

// Called when a circle gesture is seen
function handleCircle(circle, frame)
{
	var state = copter.copterStates.currentState();
	var now = circle.progress;
	// If now is less than last circle, reset last circle to 0
	if (now < lastCircle)
		lastCircle = 0;
	// If less than 2 circles are made, ignore the gesture
	if (now - lastCircle < 2)
		return 'ignored';
	// If we're on the ground, takeoff
	else if (state === 'waiting')
	{
		lastCircle = now;
		return takeoff();
	}
}

// Called when a ScreenTap gesture is seen
function handleScreenTap(screenTap, frame)
{
	//Declare variable to determine if the type of gesture we want is made
	var hand = frame.hands[0];
	var normal = hand.palmNormal;
	var now = Date.now();

	var state = copter.copterStates.currentState();
	// If we're not on the ground or we just did a tap, ignore
	if (state !== 'waiting' || (now - lastTap < 1000))
		return 'ignored';

	// Declare string of which mode we're changing to
	if (extreme == true)
		var mode = 'normal';
	else
		var mode = 'extreme';
	// If palm is facing left, change mode and log in console.
	if (normal[0] < -0.8)
	{
		lastTap = Date.now();
		console.log('Mode Changed:', mode);
		return chmod();
	}
}

function changethrust(frame)
{
	// Declare a variable of the copters current thrust
	var thrusty = copter.getThrust();
	// If one hand is in the frame, take the y component of its position and multiply by the scaling factor to set a thrust
	if (frame.hands.length == 1)
	{
		var hand = frame.hands[0];
		var position = hand.palmPosition[1];
		if (position < 150)
			thrust = 10001;
		var thrust = (position * 133);
		return copter.setThrust(thrust);
	}
	// else thrust doesn't change
	else
		return copter.setThrust(thrusty)
}

function changepitch(frame)
{
	// Declare a variable of the copters current pitch
	var pitchy = copter.getPitch();
	// If one hand is in the frame
	if (frame.hands.length == 1)
	{
		// Declare the hand object
		var hand = frame.hands[0];
		// Set pitch dependent on if its extreme or not
		if (extreme == true)
			var pitch = (hand.pitch() * (-100/3.14));
		else
			var pitch = (hand.pitch() * (-70/3.14));
		return copter.setPitch(pitch);		
	}
	// else pitch stays the same
	else
		return copter.setPitch(pitchy);
}

function changeroll(frame)
{
	// Declare a variable of the copters current roll
	var rolly = copter.getRoll();
	// If one hand is in the frame
	if (frame.hands.length == 1)
	{
		// Declare the hand object
		var hand = frame.hands[0];
		// Set pitch dependent on if its extreme or not
		if (extreme == true)
			var roll = (hand.roll() * (-100/3.14));
		else
			var roll = (hand.roll() * (-70/3.14));
		return copter.setRoll(roll);		
	}
	// else pitch stays the same	
	else
		return copter.setRoll(rolly);
}
function changeyaw(frame)
{
	// Declare a variable of the copters current roll
	var yawy = copter.getYaw();
	// If one hand is in the frame
	if (frame.hands.length == 1)
	{
		// Declare the hand object
		var hand = frame.hands[0];
		// Set variable of hand yaw
		var yaw = (hand.yaw() * (150/(0.8)));
		// Set pitch and roll values for use in later if statement
		if (extreme == true)
		{
			var pitch = (hand.pitch() * (-100/3.14));
	 		var roll = (hand.roll() * (100/3.14));			
		}
		else
		{
			var pitch = (hand.pitch() * (-70/3.14));
	 		var roll = (hand.roll() * (70/3.14));			
		}
		// If we are moving strong in one direction, remove the extra variation of yaw
		if (pitch > 10 || roll > 10 || pitch < -10 || roll < -10)
			yaw = 0;
		// Declare a switch case for the yaw value
		switch (extreme){
			case true:
				if (yaw < 40 && yaw > -40)
				{
					yaw /= 4;
				}
				else
					yaw /= 1.5;
				break;
			case false:
				if (yaw < 40 && yaw > -40)
				{
					yaw /= 10;
				}
				else
					yaw /= 8;
				break;		  	
		}
		return copter.setYaw(yaw);		
	}
	// Else Yaw stays the same. 
	else
		return copter.setYaw(yawy);
}

// Included takeoff function
function takeoff()
{
	console.log("takeoff");
	return copter.takeoff()
	.then(function()
	{
		return copter.hover();
	});
}

// Included land function
var land = function()
{
	copter.land()
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown()
		.then(function(response)
		{
			console.log(response);
			process.exit(1);
		});
	})
	.done();
}

// Instructions to connect to the quadcopter by Aerogel
driver.findCopters()
.then(function(copters)
{
	if (copters.length === 0)
	{
		console.error('No copters found! Is your copter turned on?');
		process.exit(1);
	}

	if (copters.length === 1)
		return copters[0];

	if (optimist.argv.hasOwnProperty('c'))
	{
		var patt = new RegExp('\/' + channel + '\/');
		for (var i = 0; i < copters.length; i++)
		{
			if (patt.test(copters[i]))
				return copters[i];
		}
	}

	return copters[0];
})
.then(function(uri)
{
	console.log('Using copter at', uri);
	return copter.connect(uri);
})
.then(function()
{
	console.log('connecting the leapmotion controller');
	controller.connect();
})
.fail(function(err)
{
	console.log(err);
	bail();
})
.done();
