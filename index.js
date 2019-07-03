const express = require('express')
const path = require('path')
const expressSession = require('express-session')
var cors = require('cors')
const PORT = process.env.PORT || 8080
const Pool = require('pg').Pool;

const ADMIN_LEVEL_NOT_ADMIN = 0;
const ADMIN_LEVEL_REGULAR_ADMIN = 1;
const ADMIN_LEVEL_SUPER_ADMIN = 2;

//Connect to Postgres database

//  var pool = new Pool({
//  connectionString: process.env.DATABASE_URL, ssl: true
// });



var pool = new Pool({
 user: process.env.DB_USER || 'postgres',
 password: process.env.DB_PASS || 'root',
 host: process.env.DB_HOST || 'localhost',
 database: process.env.DB_DATABASE || 'postgres'
 });


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
		}
	else if (data.gender == 'female'){
		var calorie = (10* (2.220 * data.weight) + (6.25 * data.height) - (5*data.age) - 161)
		calorie = (calorie*data.activity_level)
		calorie = calorie + data.fit_goal;
		}



		maintcal = parseInt(calorie);

	var goalcount = 0;

	// To do: check for duplicate emails and usernames
	// if (data.username == pool.query(select * from users where username == data.username))
	pool.query("INSERT INTO public.users(username, password, firstname, lastname, email, age, weight, height, gender, activity_level, fit_goal, calorie, goalcount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);",
		[data.username, data.password, data.firstname, data.lastname, data.email, data.age, data.weight, data.height, data.gender, data.activity_level, data.fit_goal, maintcal, goalcount], callback);
}


/*
Add calorie progress for user on each day
*/

function addProgress(data, callback) {
  if (data.caloriesConsumed == null) return callback('addProgress missing caloriesConsumed');
	if (data.caloriesBurned == null) return callback('addProgress missing caloriesBurned');
	if (data.timeExercised == null) return callback('addProgress missing timeExercised');
	if (data.onDate == null) return callback('addProgress missing onDate');
  if (data.currentWeight == null) return callback('addProgress missing currentWeight');
	if (data.username == null) return callback('addProgress missing username');

  // To do: add cookie to track current user's username, so no re-entry required
	pool.query("INSERT INTO public.user_progress (uid, cal_burn, time_spent, on_date, cal_cons, weight) VALUES ($1, $2, $3, $4, $5, $6);",
		[data.username, data.caloriesBurned, data.timeExercised, data.onDate, data.caloriesConsumed, data.currentWeight], callback);
}

function loginUser(data, callback) {
	if (data.username == null) return callback('loginUser missing username in 2nd argument');
	if (data.password == null) return callback('loginUser missing password in 2nd argument');

	pool.query("select * from users where username=$1", [data.username], function(error, result){
		if (error){
			return callback(error);
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
FOR ADMIN USE: Displays statistics for all Users by ID
*/
function statUserById(id, callback) {
	pool.query("select * from users where id=$1", [id], function(error, result){
		if (error){
			return callback(error);
		}

		if (result.rows.length == 0) {
			return callback("Unknown user id " + id);
		}

		callback(null, result.rows[0]);
	});
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



function loginRequired(req, res, next) {
  if (!req.session.user) {
    return res.render('pages/login')
  }

  next();
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
// Create web server


const app = express();
app.use('/', cors());
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(expressSession({
	resave: false,
	saveUninitialzed: false,
	secret: "boom"
}))

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.get('/', loginRequired,(req, res) => res.render('pages/index', {session:req.session}))
app.get('/login', (req, res) => res.render('pages/login'))
app.get('/register', (req, res) => res.render('pages/register'))
app.get('/calories', loginRequired, (req, res) => res.render('pages/calories', {session:req.session}))
app.listen(PORT, () => console.log(`Listening on ${ PORT }`))


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


app.post("/api/login", function(req, res) {
	loginUser(req.body, function (error, data) {
		if (error) {
			res.status(400);
			res.send((typeof error === "string") ? error: 'ERROR. This user is not registered. Please create account.');
			console.error(error);
			return;
		}
	getUserGoals(req.body, function(error, dailygoal){
		if(error){
			res.status(400);
			console.error(error);
			return;
		}
		// Create session
		req.session.loginid = data.id;
		req.session.login = true;
		req.session.user = {
			fname: data.firstname,
			lname: data.lastname,
			calorie: data.calorie,
			username: data.username,
			goalcount: data.goalcount,
			goals: dailygoal

		}

		//Redirect
		if (req.body.redirect != null){
			res.redirect(req.body.redirect)
		} else{
			if (data.adminlevel >= ADMIN_LEVEL_REGULAR_ADMIN) {
				res.redirect('/admin');
			} else {
				res.redirect('/');
			}
		}
	});
});
})

app.post('/api/calories', function(req, res) {
	addProgress(req.body, function(error, data) {
		if (error) {
			res.status(400);
			res.send('ERROR. Query failed, check console for more info.');
			console.error(error);
			return;
		}

		res.redirect('/');
	});
});

app.get('/logout', function(req, res, next) {
  if (req.session) {
    // delete session object
    req.session.destroy(function(err) {
      if(err) {
        return next(err);
      } else {
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
        res.render('pages/admin', results );
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

      res.redirect('/admin');
      client.release();
    }catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
});

app.get('/deleteuser/:id', async (req, res) => {
    try {
      const client = await pool.connect();
      await client.query('delete from users where username=$1',[req.params.id]);
      //await client.query('delete from backup where id=$1',[req.params.id]);
      res.redirect('/admin');
      client.release();
    } catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
});




//////////////////////////////////////////////////////////////////////////////////////////////////////////
app.post('/api/addGoal', function(req,res){
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


app.post('/api/deleteGoal', function(req,res){

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
module.exports = app;
