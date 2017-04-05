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

// Relevant Constants

// Conversion factor constants to map the angle of the hand
// to the correct quadcopter angle
var EXTREME_FACTOR = -100/3.14;
var STANDARD_FACTOR = -70/3.14;

// Yaw heuristics that make flying easier
var YAW_FACTOR = 150/0.8;
var YAW_HIGH = 40;
var YAW_LOW = -40;
// Yaw manipulation factors scale down yaw for better control
var EX_MAN = 4;
var STD_MAN = 10;
var EX_YAW_MAN = 1.5;
var STD_YAW_MAN = 8;

// Absolute pitch and rolls greater than 10 are considered extreme gestures
var FAST_HIGH = 10;
var FAST_LOW = -10;

// Thrust constants
var MIN_THRUST = 10001;
var HAND_LOW = 150;

// Hand is facing left
var HAND_LEFT = -0.8;

// Debug status
// If you want to be able to bail quickly with SIGINT, turn this on.
var DEBUG = 0;

// Allow for quitting with Control C
function killme()
{
	console.log("Caught interrupt signal");
	process.exit();
}

if (DEBUG)
	process.on('SIGINT', bail);
else
	process.on('SIGINT', killme);

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);

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
	// Store information about the hands in the frame
	var hands = frame.hands;

	// Update the motion of the quadcopter each frame
	changethrust(frame);
	changepitch(frame);
	changeroll(frame);
	changeyaw(frame);

	// Gesture handling
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
	extreme = !extreme;
}

// Set variables to protect from over-recognition
var lastCircle = 0;
var lastTap = 0;

// Called when a circle gesture is seen
function handleCircle(circle, frame)
{
	var state = copter.copterStates.currentState();
	var now = circle.progress;

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
	// Relevant frame vars
	var hand = frame.hands[0];
	var normal = hand.palmNormal;
	var now = Date.now();

	var state = copter.copterStates.currentState();

	// If we're not on the ground or we just did a tap, ignore
	if (state !== 'waiting' || (now - lastTap < 1000))
		return 'ignored';

	// What's the new mode?
	var mode = extreme ? 'normal' : 'extreme';

	// Only change mode if the hand is facing the correct direction
	if (normal[0] < HAND_LEFT)
	{
		lastTap = Date.now();
		console.log('Mode Changed:', mode);
		return chmod();
	}
}

function changethrust(frame)
{
	// Current thrust
	var old_thrust = copter.getThrust();

	if (frame.hands.length == 1)
	{
		var hand = frame.hands[0];
		var height = hand.palmPosition[1];
		// If the hand is too low, set a base thrust
		if (position < HAND_LOW)
			thrust = MIN_THRUST;
		var thrust = (height * THRUST_FACTOR);
		return copter.setThrust(thrust);
	}
	else
		return copter.setThrust(old_thrust)
}

function changepitch(frame)
{
	// Current pitch
	var old_pitch = copter.getPitch();

	// Make sure only one hand is in the frame
	if (frame.hands.length == 1)
	{
		// Get the frame's hand object
		var hand = frame.hands[0];
		// Set pitch dependent on mdoe
		var pitch = extreme ? (hand.pitch() * EXTREME_FACTOR) :
					(hand.pitch() * STANDARD_FACTOR);

		return copter.setPitch(pitch);
	}
	else
		return copter.setPitch(old_pitch);
}

function changeroll(frame)
{
	// Current roll
	var old_roll = copter.getRoll();

	// Make sure only one hand is in the frame
	if (frame.hands.length == 1)
	{
		// Get the frame's hand object
		var hand = frame.hands[0];

		// Set roll dependent on mode
		var roll = extreme ? (hand.roll() * EXTREME_FACTOR) :
					(hand.roll() * STANDARD_FACTOR);
		return copter.setRoll(roll);
	}
	else
		return copter.setRoll(old_roll);
}

function changeyaw(frame)
{
	// Current roll
	var old_yaw = copter.getYaw();

	// Make sure only one hand is in the frame
	if (frame.hands.length == 1)
	{
		// Grab the hand object
		var hand = frame.hands[0];

		// Set variable of hand yaw
		var yaw = (hand.yaw() * YAW_FACTOR);

		// Set pitch and roll by standard convention
		var pitch = extreme ? (hand.pitch() * EXTREME_FACTOR) :
					(hand.pitch() * STANDARD_FACTOR);
		var roll = extreme ? (hand.roll() * EXTREME_FACTOR) :
					(hand.roll() * STANDARD_FACTOR);

		/*
		 * If we are moving quickly in one direction, remove the extra
		 * variation of yaw. Could create a function for this check,
		 * but it's such a yaw specific optimization that it wouldn't make much sense.
		 */
		if (pitch > FAST_HI || roll > FAST_HI || pitch < FAST_LO || roll < FAST_LO) {
			yaw = 0;
			return copter.setYaw(yaw);
		}

		// Manipulate the yaw more depending on the nature of the gesture
		// i.e if it seems yaw isn't the goal of the gesture, use less
		if (yaw < YAW_HIGH && yaw > YAW_LOW)
			yaw /= extreme ? EX_MAN : STD_MAN;
		else
			yaw /= extreme ? EX_YAW_MAN : STD_YAW_MAN;

		return copter.setYaw(yaw);
	}
	else
		return copter.setYaw(old_yaw);
}

function takeoff()
{
	console.log("takeoff");
	return copter.takeoff()
	.then(function()
	{
		return copter.hover();
	});
}

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
