var chai = require('chai');
var chaiHttp = require('chai-http');
var server = require('../index.js');
var should = chai.should();

chai.use(chaiHttp);

describe('Admin', function(){
  it('should return admin page', function(err, res){
    chai.request(server).get('/admin').end(function(err, res){
    res.should.have.status(200);
    });

  });


})
