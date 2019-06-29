const express = require('express')
const path = require('path')
const expressSession = require('express-session')
const PORT = process.env.PORT || 5000
const Pool = require('pg').Pool;


//Connect to Postgres database

var pool = new Pool({
/*  user:'postgres',
  password:  'root',
  host: 'localhost',
  database: 'postgres' || */
  connectionString: process.env.DATABASE_URL, ssl: true
});



function createUser(data, callback) {
	if (data.username == null) return callback('createUser missing username in 2nd argument');
	if (data.password == null) return callback('createUser missing password in 2nd argument');
	if (data.firstname == null) return callback('createUser missing firstname in 2nd argument');
	if (data.lastname == null) return callback('createUser missing lastname in 2nd argument');
	if (data.email == null) return callback('createUser missing email in 2nd argument');
	if (data.birthday == null) return callback('createUser missing birthday in 2nd argument');
	if (data.weight == null) return callback('createUser missing weight in 2nd argument');
	if (data.height == null) return callback('createUser missing height in 2nd argument');


	// To do: check for duplicate emails and usernames
	// if (data.username == pool.query(select * from users where username == data.username))
	pool.query("INSERT INTO public.users(username, password, firstname, lastname, email, birthday, weight, height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);",
		[data.username, data.password, data.firstname, data.lastname, data.email, data.birthday, data.weight, data.height], callback);
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

function loginRequired(req, res, next) {
  if (!req.session.user) {
    return res.render('pages/login')
  }

  next();
}

// Create web server


const app = express();

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
app.get('/calories', loginRequired, (req, res) => res.render('pages/calories.ejs'))

app.listen(PORT, () => console.log(`Listening on ${ PORT }`))


app.post('/api/register', function(req, res) {
	createUser(req.body, function(error, data) {
		if (error) {
			res.status(400);
			res.send('ERROR. Query failed, check console for more info.');
			console.error(error);
			return;
		}

		res.redirect('pages/login');
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

		// Create session
		req.session.loginid = data.id;
		req.session.login = true;
		req.session.user = {
			name: data.firstname+" "+data.lastname
		}
		//Redirect
		if (req.body.redirect != null){
			res.redirect(req.body.redirect)
		}
		else{
			res.redirect('/');
		}
	})
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
