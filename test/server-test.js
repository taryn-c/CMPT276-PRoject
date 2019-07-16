var chai = require('chai');
var chaiHttp = require('chai-http');
var server = require('../index.js');
var should = chai.should();
var assert= require('assert');


chai.use(chaiHttp);

describe('Admin', function(){
  it('should return admin page', function(done){
    chai.request(server).get('/admin').end(function(err, res){
    res.should.have.status(200);
    done();
    });

  });
  it('should remove a user', function(done){
    chai.request(server).get('/delete-user:id').end(function(err, res){
      res.body.should.equal(1);

      done();
    });
  });

});
