const express = require('express')
const path = require('path')
const expressSession = require('express-session')
const app = express();
const crypto = require('crypto');
const request = require('request');
var cors = require('cors')
var assert= require('assert')
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var multer = require('multer');
var async = require('async');

const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY;
const NUTRITIONIX_DEV_KEY = process.env.NUTRITIONIX_DEV_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PORT = process.env.PORT || 8080
const Pool = require('pg').Pool;

const ADMIN_LEVEL_NOT_ADMIN = 0;
const ADMIN_LEVEL_REGULAR_ADMIN = 1;
const ADMIN_LEVEL_SUPER_ADMIN = 2;

//Connect to Postgres database
/*
 var pool = new Pool({
 connectionString: process.env.DATABASE_URL, ssl: true
 });
*/


// DATABASE SCHEMAS Version 1: 07-12
/*
users(username, password, firstname, lastname, email, height, weight, calorie
	gender, activity_level, fit_goal, age, goalcount, userimage DEFAULT 'default.png', totalrequest INT)

user_progress(uid, cal_burn, time_spent, on_date, cal_cons, weight)

request(rec:text REFERENCES users:username, sent:text REFERENCES users:username, message:text)

friendslist(f1:text REFERENCES users:username, f2:text REFERENCES users:username)

dailygoal(username REFERENCES users:username, goalnum:int, goal:text)


*/

var pool = new Pool({
 user: process.env.DB_USER || 'postgres',
 password: process.env.DB_PASS || 'root',
 host: process.env.DB_HOST || 'localhost',
 database: process.env.DB_DATABASE || 'postgres'
});


// Creates a consistent hash for a username that shouldn't be able to be
// converted back into the original username within the next 1000 years.
function usernameHash(username) {
	var hash = crypto.createHash('sha256');
	return hash.update(username).digest('hex');
}

/*
Creates user and queries data into user table
*/

function createUser(data, callback) {
	if (data.username == null) return callback('createUser missing username in 2nd argument');
	if (data.password == null) return callback('createUser missing password in 2nd argument');
	if (data.firstname == null) return callback('createUser missing firstname in 2nd argument');
	if (data.lastname == null) return callback('createUser missing lastname in 2nd argument');
	if (data.email == null) return callback('createUser missing email in 2nd argument');
	if (data.age == null) return callback('createUser missing age in 2nd argument');
	if (data.weight == null) return callback('createUser missing weight in 2nd argument');
	if (data.height == null) return callback('createUser missing height in 2nd argument');
	if (data.gender == null) return callback('createUser missing gender in 2nd argument');
	if (data.activity_level == null) return callback('createUser missing activity_level in 2nd argument');
	if (data.fit_goal == null) return callback('createUser missing fit_goal in 2nd argument');

	if(data.gender == 'male'){
		var calorie = (10.0 * (2.220 * data.weight) + (6.25 * data.height) - (5*data.age) + 5)
		calorie = (calorie*data.activity_level)
		calorie = calorie + data.fit_goal;
		var userImage = 'default_m.png';
		}
	else if (data.gender == 'female'){
		var calorie = (10* (2.220 * data.weight) + (6.25 * data.height) - (5*data.age) - 161)
		calorie = (calorie*data.activity_level)
		calorie = calorie + data.fit_goal;
		var userImage = 'default_f.png';
		}



		maintcal = parseInt(calorie);

	var goalcount = 0;

	// To do: check for duplicate emails and usernames
	// if (data.username == pool.query(select * from users where username == data.username))
	pool.query("INSERT INTO public.users(username, password, firstname, lastname, email, age, weight, height, gender, activity_level, fit_goal, calorie, goalcount, userimage, totalrequest) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);",
		[data.username, data.password, data.firstname, data.lastname, data.email, data.age, data.weight, data.height, data.gender, data.activity_level, data.fit_goal, maintcal, goalcount, userImage, 0], callback);

}


/*
Add calorie progress for user on each day
*/

function addProgress(username, data, callback) {
  if (data.caloriesConsumed == null) data.caloriesConsumed = -1;
	if (data.activityMET == null) return callback('addProgress missing activityMET');
	if (data.timeExercised == null) return callback('addProgress missing timeExercised');
	if (data.onDate == null) return callback('addProgress missing onDate');
  if (data.currentWeight == null) return callback('addProgress missing currentWeight');
	if (username == null) return callback('addProgress missing username');

  var burned = Math.round(data.timeExercised * 0.0175 * data.activityMET * (data.currentWeight/2.20462));

	pool.query("INSERT INTO public.user_progress (uid, cal_burn, time_spent, on_date, cal_cons, weight) VALUES ($1, $2, $3, $4, $5, $6);",
		[username, burned, data.timeExercised, data.onDate, data.caloriesConsumed, data.currentWeight], callback);
}

function loginUser(data, callback) {
	if (data.username == null) return callback('loginUser missing username in 2nd argument');
	if (data.password == null) return callback('loginUser missing password in 2nd argument');

	pool.query("select * from users where username=$1", [data.username], function(error, result){
		if (error){
			return callback(error);
		}
		if (result.rowCount == 0){
			callback("Invalid user/password", null);
			return;
		}

		if (result.rows[0].password != data.password){
			callback("Invalid user/password");
			return;
		}

		callback(null, result.rows[0]);
	});
}


/*
FOR ADMIN USE: Displays statistics for User
*/
function statUser(data, callback) {
	let id = (typeof data === 'number') ? data : (data.loginid == null ? data.id : data.loginid);
	if (id != null) {
		return statUserById(id, callback);
	}

	let username = (typeof data === 'string') ? data : data.username;
	if (username != null) {
		return statUserByUsername(username, callback);
	}

	throw new Error("Unknown user lookup key provided to statUser");
}

/*
FOR ADMIN USE: Displays statistics for User by username
*/
function statUserByUsername(username, callback) {
	pool.query("select * from users where username=$1", [username], function(error, result){
		if (error){
			return callback(error);
		}

		if (result.rows.length == 0) {
			return callback("Unknown user login " + username);
		}

		callback(null, result.rows[0]);
	});
}


// Ensures that user is logged in
function loginRequired(req, res, next) {
  if (!req.session.user) {
    return res.render('pages/login')
  }
  else assert(req.session.user);

  next();
}


// Create web server

var sessionMiddleware = expressSession({
	resave: false,
	saveUninitialzed: false,
	secret: "boom"
});

app.use('/', cors());
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(sessionMiddleware);

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.get('/', loginRequired,(req, res) => res.render('pages/index', {session:req.session}))
app.get('/login', (req, res) => res.render('pages/login'))
app.get('/register', (req, res) => res.render('pages/register'))
app.get('/calories', loginRequired, (req, res) => res.render('pages/calories', {session:req.session}))
app.get('/calories/lookup', loginRequired, (req, res) => res.render('pages/calories_lookup', {session:req.session}))
app.get('/chat', loginRequired, (req, res) => res.render('pages/chat', {session:req.session}))
app.get('/profile', loginRequired, function(req, res){
	pool.query("select sent from request where rec=$1", [req.session.user.username], function(error, result){
		if (error){
			return callback(error);
		}
		req.session.incReq = result.rows
	})
		res.render('pages/profile', {session:req.session})})
app.get('/workouts', loginRequired, (req, res) => res.render('pages/workouts', {session:req.session}))
app.get('/gyms', loginRequired, (req, res) => res.render('pages/gyms', {session:req.session}))


// app.listen(PORT, () => console.log(`Listening on ${ PORT }`))

http.listen(PORT, () => console.log(`Listening on ${ PORT }`))

io.use((socket, next) => {
	sessionMiddleware(socket.request, socket.request.res, next);
});

var chat_clients = {};
io.on('connection', function(socket) {
  if (socket.request.session.login !== true) {
  	socket.disconnect("This feature requires login.");
  	return;
  }

  var session = socket.request.session;
  var client = chat_clients[session.loginid] = {
  	authorId: session.loginid,
  	author: `${session.user.fname} ${session.user.lname.substring(0, 1).toUpperCase()}.`
  };

  // When the user connects, send them the user list.
  socket.emit('user list', chat_clients);

  // When the user sends a message, forward it.
  socket.on('chat message', function(msg){
    io.emit('chat message', {
  		...client,
    	text: msg,
    	date: Date.now(),
    });
  });

  // When the user connects, send a join message to all other clients.
  io.emit('user joined', {
  		...client,
    	date: Date.now(),
  });

  // When the user disconnects, send a leave message to all other clients.
  socket.on('disconnect', function(reason) {
  	io.emit('user left', {
  		...client,
    	date: Date.now(),
  	});

  	delete chat_clients[session.loginid];
  });

});


app.post('/api/register', function(req, res) {
	createUser(req.body, function(error, data) {
		if (error) {
			res.status(400);
			res.send('ERROR. Query failed, check console for more info.');
			console.error(error);
			return;
		}

		res.redirect('/');
	});
});

app.post('/api/remote/lookup_calories', function(req, res) {
	nutritionixFoodLookup(req.body, (error, data) => {
		if (error) {
			res.status(400);
			res.error('Remote API failure.');
			console.error(error);
			return;
		}

		if (!data.foods) {
			res.end(JSON.stringify({
				success: false,
				message: data.message
			}));
			return;
		}

		res.end(JSON.stringify({
			success: true,
			calories: data.foods[0].nf_calories,
			food: data.foods[0].food_name
		}));
	});
});

app.post("/api/login", function(req, res) {
	loginUser(req.body, function (error, data) {
		if (error) {
			res.status(400);
			res.render('pages/loginerror');
			console.error(error);
			return;
		}
	getUserGoals(req.body, function(error, dailygoal){
		if(error){
			res.status(400);
			console.error(error);
			return;
		}
	getFriendList(req.body, function(error, friends){
		if(error){
			res.status(400);
			console.error(error);
			return;
		}
	getFriendRequest(req.body, function(error, incoming){
		if(error){
			res.status(400);
			console.error(error);
			return;
			}
	getOutgoingRequests(req.body, function(error, outgoing){
		if(error){
			res.status(400);
			console.error(error);
			return;
			}

		// Create session
		req.session.loginid = usernameHash(data.username);
		req.session.login = true;
		req.session.user = {
			fname: data.firstname,
			lname: data.lastname,
			calorie: data.calorie,
			username: data.username,
			goalcount: data.goalcount,
			userImage: data.userimage,
			totalRequests: data.totalrequest,
			goals: dailygoal,
			friendsList: friends,
			incReq: incoming,
			sentReq: outgoing

		}

		//Redirect
		if (req.body.redirect != null)
		{
			res.redirect(req.body.redirect)
		}
		else
		{
			if (data.adminlevel >= ADMIN_LEVEL_REGULAR_ADMIN) {
				res.redirect('/admin');
			}
			else {
				res.redirect('/');
			}
		}
	});
	});
	});
	});
	});
})

app.post('/api/calories', loginRequired, function(req, res) {
	addProgress(req.session.user.username, req.body, function(error, data) {
		if (error) {
			res.status(400);
			res.send('ERROR. Query failed, check console for more info.');
			console.error(error);
			return;
		}

		//res.redirect('/calories');
	});
});


app.get('/logout', function(req, res, next) {
  if (req.session) {
    // delete session object
    req.session.destroy(function(err) {
      if(err) {
        return next(err);
      } else {
        assert(!req.session);
        return res.redirect('/');
      }
    });
  }
});
//////////////////////ADMIN VIEWS//////////////////////////////////////////////////////
app.get('/admin', loginRequired, async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT * FROM users order by lastname', function(error, result){
        const results = { 'results': (result) ? result.rows : null};
        res.render('pages/admin', results)
        client.release();
      });
    }catch (err) {
      console.error(err);
      res.send("Error " + err);
    }

});

app.get('/edituser/:id', async (req, res) => {
    try {
      const client = await pool.connect();
      await client.query("select * from users where username=$1",[req.params.id], function(error, result){
        var user={user: result.rows[0]};
        res.render('pages/editUser', user);
        client.release();
      });
    }catch (err) {
      console.error(err);
      res.send("Error " + err);
    }

});

app.post('/edituser/:id', async (req, res) => {
    try {
      const client = await pool.connect();
      await client.query('update users set username=$1, password=$2, firstname=$3, lastname=$4, email=$5, age=$6, weight=$7, height=$8, gender=$9, activity_level=$10, fit_goal=$11 where id=$12',
      [req.body.username, req.body.password, req.body.firstname, req.body.lastname, req.body.email,
      req.body.age, req.body.weight, req.body.height, req.body.gender, req.body.activity_level, req.body.fit_goal, req.params.id]);

      res.redirect('pages/admin');
      client.release();
    }catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
});

app.get('/delete-user/:id', async (req, res) => {
    try {
      const client = await pool.connect();
      await client.query('delete from users where username=$1',[req.params.id]);
      await client.query('select * from users where username=$1',[req.params.id], function(error, result){
        var count=result.rowCount;

        assert(count==0);
        res.redirect('/admin')
        client.release();
      });

    } catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
});


//////////////////////////////////////////////////////////////////////////////////////////////////////////

app.post('/api/addGoal', loginRequired, function(req,res){
	try {

		pool.query('INSERT INTO dailygoal(username, goalnum, goal) VALUES($1,$2,$3);',[req.body.username,req.body.goalcount1,req.body.goal],function(err){
			if(err){
				console.log(err);
			}
		});
		pool.query('UPDATE users SET goalcount = $1 WHERE username = $2;',[req.body.goalcount1, req.body.username],function(err){
			if(err){
				console.log(err);
			}
		});
	}
	catch(err){
		console.log(err);
		res.send("Error " + err);
	}
	return;
});


app.post('/api/deleteGoal', loginRequired, function(req,res){

	try {

			pool.query('DELETE FROM dailygoal WHERE (username = $1 AND goalnum = $2);',[req.body.username,req.body.goalcount],function(err){
				if(err){
					console.log(err);
				}
				console.log("Goal deleted");
			});
		}
		catch(err){
			console.log(err);
			res.send("Error " + err);
		}

});

app.get('/forum-home', loginRequired, async (req, res)=> {
    try {
      const client = await pool.connect();
      await client.query('select * from topics left join users on topics.topic_by= users.username order by topic_id desc limit 5', function(error, result){
        res.render('pages/forum', {results: result.rows, user: req.session.user.username });
        client.release();
      });

    }catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
});

app.get('/addTopic', loginRequired, function(req, res){
  res.render('pages/addTopic');
});

app.post('/postTopic', loginRequired, async (req, res) => {
    try {
      const client = await pool.connect();
      await client.query("insert into topics(topic_subject, topic_by, topic_content, topic_cat) values($1, $2, $3, $4)",[req.body.topic, req.session.user.username, req.body.content, req.body.category]);
      res.redirect('/forum-home');
      client.release();
    } catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
});

app.get('/topic/:id', loginRequired, async (req, res) => {
  try{
    const client= await pool.connect();

    await client.query("select * from topics full join replies on topics.topic_id=replies.reply_topic where topic_id=$1", [req.params.id], function(error, result){
        var topic={topic: (result) ? result.rows : null};
        res.render('pages/topic', topic);
        client.release();
    });
  }catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.post('/postReply/:id', async(req, res) =>{
  try {
    const client=await pool.connect();
    await client.query('insert into replies(reply_topic, reply_by) select topic_id, topic_by from topics order by topic_id desc limit 1');
    await client.query('update replies set reply_content=$1 where reply_id IN (SELECT max(reply_id) FROM replies)',[req.body.reply]);
    res.redirect('/topic/'+req.params.id);
    client.release();

  }catch (err){
    console.error(err);
    res.send(err);
  }

});


function getFriendRequest(data, callback){

	pool.query("select sent from request where rec=$1", [data.username], function(error, result){
		if (error){
			return callback(error);
		}

	if(result.rowCount > 0){
		callback(null, result.rows);
	}
	else{
		callback(null,null);
	}
	});
}
function getOutgoingRequests(data, callback){

	pool.query("select rec from request where sent=$1", [data.username], function(error, result){
		if (error){
			return callback(error);
		}

	if(result.rowCount > 0){
		callback(null, result.rows);
	}
	else{
		callback(null,null);
	}
	});
}



function getUserGoals(data, callback){

	pool.query("select goalnum, goal from dailygoal where username=$1", [data.username], function(error, result){
		if (error){
			return callback(error);
		}

	if(result.rowCount > 0){
		callback(null, result.rows);
	}
	else{
		callback(null,null);
	}
	});
}
function getFriendList(data, callback){

	pool.query("select f1 from friendslist where f2=$1", [data.username], function(error, result){
		if (error){
			return callback(error);
		}

	if(result.rowCount > 0){
		callback(null, result.rows);
	}
	else{
		callback(null,null);
	}
	});
}

app.post('/change-picture', (req, res) => {

	upload(req, res, (err) => {
		if (err) {
			console.log(err);
			res.render('pages/index.ejs', { session: req.session });
		}
		else {
			if (req.file == undefined) {
				res.redirect('pages/profile', {
					msg: 'Error: No File Selected!'
				});
			}
			else {

				pool.query("UPDATE users SET userimage = $1 WHERE username = $2;", [req.session.user.username + req.file.originalname, req.session.user.username], function (err) {
					if (err) {
						console.log(err);
					}

				})
				req.session.user.userImage = req.session.user.username + req.file.originalname;
				res.render('pages/profile', {
					session:req.session,
					msg: 'Photo uploaded succesfully!' })
			};
		}
	});

});
module.exports = app;

// Set The Storage Engine
const storage = multer.diskStorage({
	destination: './public/upload/',
	filename: function(req, file, cb){
	  cb(null,req.session.user.username+file.originalname);
	}
  });

const upload = multer({
	storage: storage,
	limits: { fileSize: 1000000 },
	fileFilter: function (req, file, cb) {
		checkFileType(file, cb);
	}
}).single('upload');

// Check File Type
function checkFileType(file, cb){
	// Allowed ext
	const filetypes = /jpeg|jpg|png|gif/;
	// Check ext
	const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
	// Check mime
	const mimetype = filetypes.test(file.mimetype);

	if(mimetype && extname){
	  return cb(null,true);
	} else {
	  cb('Error: Images Only!');
	}
  }


app.get('/search', loginRequired, async (req, res) => {
	try {

		pool.query("select username, firstname, lastname, userimage from users inner join friendslist on username=f2 where f1=$1", [req.session.user.username], function (error, friends) {
			if(error) console.log(error);
			console.log(friends.rows);
			if(friends.rows == 0){
				friends.rows = null;
			}
		pool.query("select username, firstname, lastname, userimage from users inner join request on sent=username where rec=$1", [req.session.user.username], function (error, incomings) {
			if(error) console.log(error);
			console.log(incomings.rows);
			if(incomings.rows == 0){
				incomings.rows = null;
			}
		pool.query("select username, firstname, lastname, userimage from users inner join request on rec=username where sent=$1", [req.session.user.username], function (error, outgoings) {
			if(error) console.log(error);
			console.log(outgoings.rows);
			if(outgoings.rows == 0){
				outgoings.rows = null;
			}
		pool.query("select username, firstname, lastname, userimage from users where (username!=$1) AND username NOT IN (select sent from request where $1=rec UNION select f2 from friendslist where $1=f1 UNION select rec from request where $1=sent)", [req.session.user.username], function (error, results) {
			if(error) console.log(error);
			console.log(results.rows);
			if(results.rows == 0){
				results.rows = null;
			}

		console.log(results.rows);
			res.render('pages/search', {
				session: req.session,
				result: results.rows,
				friend: friends.rows,
				incoming: incomings.rows,
				outgoing: outgoings.rows,
				msg: ''
			});
		});
	});
});
});

	} catch (err) {
		console.error(err);
		res.send("Error " + err);
	}
});

function searchFriend(data, callback){
	try {
		pool.query("select username, firstname, lastname, userimage from users where username = $1 and username != $2;", [data.searchfriend,req.session.user.username], function(error, results){
		  const result = { 'results': (results) ? results.rows : null};
		  return result;
		});

	  }catch (err) {
		console.error(err);
		res.send("Error " + err);
	  }
}

function incrementRequest(data, callback){
	try {
		pool.query("update users set totalrequest = totalrequest + 1 where username = $1", [data.username], function(error){
		if (error) console.log(error);
		return;
		});

	  }catch (err) {
		console.error(err);
		res.send("Error " + err);
	  }
}
function decrementRequest(data, callback){
	try {
		pool.query("update users set totalrequest = totalrequest - 1 where username = $1", [data.username], function(error){
		if (error) console.log(error);
		return;
		});

	  }catch (err) {
		console.error(err);
		res.send("Error " + err);
	  }
}

function sendRequest(sender, reciever){
	try {
		pool.query("INSERT INTO request(sent,rec) VALUES($1,$2);", [sender, reciever], function(error){
		if (error) console.log(error);
		return;
		});

	  }catch (err) {
		console.error(err);
		res.send("Error " + err);
	  }
}

function deleteRequest(sender, reciever){
	try {
		pool.query("DELETE FROM request(sent,rec) WHERE sent = $1 AND rec = $2", [sender, reciever], function(error){
		if (error) console.log(error);
		return;
		});

	  }catch (err) {
		console.error(err);
		res.send("Error " + err);
	  }
}


function addFriends(f1, f2){
	try {
		pool.query("INSERT INTO friendslist(f1,f2) VALUES($1,$2);", [f1,f2], function(error){
		if (error) console.log(error);
		});
		pool.query("INSERT INTO friendslist(f1,f2) VALUES($1,$2);", [f2,f1], function(error){
			if (error) console.log(error);
			}
		)

	  }catch (err) {
		console.error(err);
		res.send("Error " + err);
	  }
}


app.post('/search', loginRequired, function (req, res) {
	var searchfriend = req.body.searchfriend;
	if (searchfriend) {
		var mssg = '';
		if (searchfriend == req.user.username) {
			searchfriend = null;
		}
		searchFriend(searchfriend, function (err, result) {
			if (err) throw err;
			res.render('search', {
				result: result,
				mssg: mssg
			});
		});
	}

	async.parallel([
		function (callback) {
			if (req.body.receiverName) {
				var flag = 0;
				if (req.session.user.sentReq != null){
				for(var i = 0; i < req.session.user.sentReq.length; i++){
					if(req.body.receiverName == req.session.user.sentReq[i]){
						flag = 1;
						break;
					}
				}}
				if (req.session.user.friendsList != null){
				for(var i = 0; i < req.session.user.friendsList.length; i++){
					if(req.body.receiverName == req.session.user.friendsList[i]){
						flag = 1;
						break;
					}
				}}
				if (flag == 0){
					incrementRequest(req.session.user);
					sendRequest(req.session.user.username, req.body.receiverName);
				}


			}
		}],
		(err, results) => {
			res.redirect('pages/search', {session:req.body.session});
		});

	async.parallel([
		// this function is updated for the receiver of the friend request when it is accepted
		function (callback) {
			if (req.body.senderId) {
				addFriends(req.body.senderId, req.session.user.username);
				decrementRequest(req.session.user.username);
			}
		},
		// this function is updated for the sender of the friend request when it is accepted by the receiver
		function (callback) {
			if (req.body.senderId) {
				deleteRequest(req.body.senderId, req.session.user.username);
			}
		}
	], (err, results) => {
		res.redirect('/search');
	});
});


app.post('/addFriend', loginRequired, async(req,res) =>{
	try {

		await pool.query('INSERT INTO friendslist(f1, f2) VALUES($1,$2);',[req.session.user.username, req.body.senderadd],function(err){
			if(err){
				console.log(err);
			}

		pool.query('INSERT INTO friendslist(f2, f1) VALUES($1,$2);',[req.session.user.username, req.body.senderadd],function(err){
			if(err){
				console.log(err);
			}

		pool.query('DELETE FROM request WHERE rec = $1 AND sent = $2;',[req.session.user.username, req.body.senderadd],function(err){
			if(err){
				console.log(err);
			}

		pool.query("select sent from request where rec=$1", [req.session.user.username], function(error, result){
			if (error){
				return callback(error);
			}
			req.session.user.incReq = result.rows;
		pool.query("select f1 from friendslist where f2=$1", [req.session.user.username], function(error, result1){
			if (error){
				return callback(error);
			}
			req.session.user.friendsList = result1.rows;
			res.render('pages/profile',{session:req.session} )
		});
	});
});
		});
	});



	}
	catch(err){
		console.log(err);
		res.send("Error " + err);
	}
	return;
});


app.post('/removeFriend', loginRequired, function(req,res){

	try {

			pool.query('DELETE FROM request WHERE (rec = $1 AND sent = $2);',[req.session.user.username,req.body.senderdecline],function(err){
				if(err){
					console.log(err);
				}

			pool.query("select sent from request where rec=$1", [req.session.user.username], function(error, result){
				if (error){
					console.log(err);
				}
				req.session.user.incReq = result.rows;
				res.render('pages/profile', {session:req.session})
			})
		});
		}
		catch(err){
			console.log(err);
			res.send("Error " + err);
		}

});

app.post('/searchuser', loginRequired, async (req, res)=> {
    try {

		var msg = '';
		console.log(req.body.searchfriend);
		console.log(req.session.user.username);
		pool.query("select username, firstname, lastname, userimage from users inner join friendslist on f1=username where f1=$1 and f2=$2", [ req.body.searchfriend,req.session.user.username], function (error, friends) {
			if(error) console.log(error);
			console.log(friends.rows);
			if(friends.rows == 0){
				friends.rows = null;
			}
		pool.query("select username, firstname, lastname, userimage from users inner join request on sent=username where rec=$1 and sent=$2", [ req.session.user.username,req.body.searchfriend], function (error, incomings) {
			if(error) console.log(error);
			console.log(incomings.rows);
			if(incomings.rows == 0){
				incomings.rows = null;
			}
		pool.query("select username, firstname, lastname, userimage from users inner join request on username=rec where rec=$1 and sent=$2", [req.body.searchfriend,req.session.user.username,], function (error, outgoings) {
			if(error) console.log(error);
			console.log(outgoings.rows);
			if(outgoings.rows == 0){
				outgoings.rows = null;
			}
		if (friends.rows == null && incomings.rows == null && outgoings.rows == null){
		pool.query("select username, firstname, lastname, userimage from users where username=$1", [req.body.searchfriend], function (error, results) {
			if(error) console.log(error);
			console.log(results.rows);
			if(results.rows == 0){
				results.rows = null;
				var msg = "No username with that value exists"
			}
			res.render('pages/search', {
				session: req.session,
				result: results.rows,
				friend: friends.rows,
				incoming: incomings.rows,
				outgoing: outgoings.rows,
				msg: msg
			});
		})}
		else{
			res.render('pages/search', {
				session: req.session,
				result: null,
				friend: friends.rows,
				incoming: incomings.rows,
				outgoing: outgoings.rows,
				msg: "Your search results"
			});
		}


		});
	});
});

    }catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
});

// Remote API: Nutritionix

// Looks up the calories and other data for food.
function nutritionixFoodLookup(food, callback) {
	request({
		url: 'https://trackapi.nutritionix.com/v2/natural/nutrients',
		method: 'POST',
		body: {
			query: food.query,
			timezone: "US/Eastern"
		},
		json: true,
		headers: {
			'x-app-id': NUTRITIONIX_DEV_KEY, 
			'x-app-key': NUTRITIONIX_API_KEY
		}
	}, (err, res, data) => {
		if (err) return callback(err);

		callback(null, data);
	})
}
