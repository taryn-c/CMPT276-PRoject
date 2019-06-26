const express=require('express');
const path= require('path');
const PORT= 5000;
const app= express();

//connect to postgres



app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json());
app.use(express.urlencoded({extended:false}));

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
