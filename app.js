var express=require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
/*var routes = require('./routes/index');
var users = require('./routes/users');*/
var app = require('express')();
var http = require('http').Server(app);
var path = require('path');
var sess;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

var io = require('socket.io')(http);
var fs = require('fs');
var mysql   = require('mysql');

var connection="";
function getConnection()
{	
	if(connection=="")
	{
		connection=mysql.createConnection({host     : 'localhost',user     : 'root',password : 'root'});
		connection.connect();
		return connection;
	}
	return connection;
}

app.get('/chat', function(req, res){
  res.sendFile(__dirname+'//index.html');
});

var making_process = io.of('/process');
var prefId_match = io.of('/matchfound');
var timer_socket = io.of('/timerstart');

prefId_match.on('connection',function(socket)
								{
									console.log("#############################	Connected to test for match found	#############################");
									socket.on('matchid',function(msg){console.log("Match found socket turned on for match id"+msg);socket.join(msg);});
								}
			   );

making_process.on('connection', function(socket){
  console.log(making_process.adapter.rooms.room);
  console.log("Connection to match making with a count of "+making_process.adapter.rooms.room.length);
  console.log("id::::::"+socket.matchid);
  socket.on('matchid',function(msg){console.log("message from the jade::::"+msg);socket.join(msg);});
  socket.on('role_change',
                    function(msg){
									var temp=msg.split(",");
                                    var connection = getConnection();
									connection.query("SELECT roleid from lol.roles where role_name='"+temp[1]+"'",function(err,change_id)
									{
										if (err) throw err;
										var dataInsert={matchmakingid:temp[2],changetime:new Date(),userid:temp[0],roleid:change_id[0].roleid};
										connection.query('INSERT INTO lol.rolechange_track SET ?', dataInsert);
									});
									var roles_selected=new Array();
									connection.query("SELECT userid FROM lol.matchmaking where matchmakingid='"+temp[2]+"'", 
                                                function(err, rows) 
                                                {
                                                    if (err) throw err;
													
													for(var i=0;i<rows.length;i++)
													{
																	connection.query("select roleid from lol.rolechange_track where matchmakingid='"+temp[2]+"' and userid='"+rows[i].userid+"' order by changetime desc limit 1",
																			function(err,roles_rows)
																			{
																				if(roles_rows.length != 0)
																				{
																					roles_selected.push(roles_rows[0].roleid);
																				}
																			});
													}
													setTimeout(
																function() 	{
																				if(roles_selected.length==3)
																				{
																						roles_selected.sort();
																						console.log("Roles Selected:::"+roles_selected);
																						for(var i=0;i<rows.length;i++)
																						{
																							connection.query("SELECT preferenceId,roleId FROM lol.preferences where userid='"+rows[i].userid+"' order by preferenceId,roleId",
																							function(err,prefRows)
																							{
																								if(err) throw err;
																								for(var j=0;j<prefRows.length;)
																								{
																									var prefId=prefRows[j].preferenceId;
																									console.log("Prefid::::"+prefId);
																									var prefMatch=true;
																									for(var k=j; j<prefRows.length && prefRows[j].preferenceId==prefId;j++)
																									{   
																										if(prefRows[j].roleId != roles_selected[j-k])
																										{
																											console.log("Role Selected["+(j-k)+"] = "+roles_selected[j-k]+" Preference of the user is "+prefRows[j].preferenceId+" with role::"+prefRows[j].roleId);
																											prefMatch=false;
																										}
																									}
																									
																									if(prefMatch)
																									{
																										console.log("Pref Id ::::"+prefId+" is a good match for the user ...... "+rows);
																										prefId_match.to(temp[2]).emit('match_found',prefId);
																									}
                                        
																								}
																							}
																							
																							);
																						}
																				}
																			},200);
													making_process.to(temp[2]).emit('role_change',msg);
                                                });
									
              });
});



timer_socket.on('connection',function(socket)
							{
								socket.on('matchid',function(msg){socket.join(msg);});
								socket.on('page_loaded',function(msg){
																		if(timer_socket.adapter.rooms[msg].length == 3)
																		{
																			console.log("Time to start the timer now");
																			var connection = getConnection();
																			
																			connection.query("SELECT match_starttime as start  FROM lol.matchmaking where matchmakingid='"+msg+"' LIMIT 1",
																											function(err, currentrow) 
																											{
																												if (err) {  timer_socket.to(msg).emit('sign',err);}
																												var match_starttime=new Date(currentrow[0].start);
																												var time_now=new Date();
																												var time_difference=60-Math.round((time_now-match_starttime)/1000);
																												console.log("Timer start time ::::: "+time_difference);
																												timer_socket.to(msg).emit('start_time',time_difference);
																											});
																		}
																	 
										 });
								});
var matchmaking = io.of('/match');
matchmaking.users=[];

matchmaking.on('connection', function(socket){
    console.log("Connection to match making with a count of"+matchmaking.adapter.rooms.room);
    
  socket.join('room');
  console.log('room filled with a person');
  socket.on('sign',
                    function(msg){
                                    matchmaking.users[matchmaking.adapter.rooms.room.length-1]=msg;
                                    console.log("matchmaking.users:::::::::::;;"+matchmaking.users);
                                    console.log(msg+" :::::: "+matchmaking.adapter.rooms.room.length);
                                    console.log(matchmaking.adapter.rooms.room);
                                    
                                    if(matchmaking.adapter.rooms.room.length == 3)
                                    {
                                        
                                        var connection = getConnection();
                                        
                                        connection.query("SELECT IFNULL(MAX(matchmakingid),'M00000') as MatchId from lol.MatchMaking",
                                                    function(err, currentrow) 
                                                    {
                                                        if (err) {  matchmaking.to('room').emit('sign',err);}
                                                        var matchid=currentrow[0].MatchId;
                                                        var temp="";
                                                        var pad=6-(""+(parseInt(matchid.substr(1,6))+1)).length;
                                                        for(var j=0;j<pad;j++)
                                                            temp+="0";
                                                        matchid='M'+temp+(parseInt(matchid.substr(1,6))+1);
                                                        var dataInsert;
                                                        var match_start=new Date();
                                                        for(var i=0;i<matchmaking.users.length;i++)
                                                        {
                                                            dataInsert={matchmakingid:matchid,userid:matchmaking.users[i],match_starttime:match_start,match_endtime:0};
                                                            connection.query('INSERT INTO lol.MatchMaking SET ?', dataInsert);    
                                                        }
                                                        
                                                        matchmaking.to('room').emit('sign',matchid);
                                                        delete matchmaking.adapter.rooms.room;
                                                        console.log("userid::::"+msg+" Entered into match making");
                                                        //io.to('room').emit('sign','Ready for making');
                                                        //io.sockets.clients('room').forEach(function(s){s.leave('room');});
                                                    });
                                    }
                                    else
                                    {
                                        matchmaking.to('room').emit('sign',(3-matchmaking.adapter.rooms.room.length)+' more users required for match making');
                                    }
              });
});

io.on('connection', function(socket){
  socket.on('message', 
						function(msg)
									{
										io.user=msg;
										io.emit('message', 'Last user to start the game:'+msg);
									}			
			);
  
  socket.on('disconnect', function(){
    console.log('user disconnected '+io.user);
    var connection = getConnection();
	connection.query("DELETE from lol.user_history where userid='"+io.user+"'");
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});

app.get('/', function(req, res, next) {
  res.render('index', { title: 'Match Making Software',result:"" });
});

app.post('/', function(req, res, next) {
  res.render('index', { title: 'Match Making Software',result:"" });
});

app.post('/play',function(req,res,next){console.log("Play started::::"+req.body.play); 
											var play=req.body.play; 
											if(play === "Yes")
											{
												console.log(req.body);
												console.log("YES````"+req.body.play);
												console.log("YES userid````"+req.body.userid);
												var connection = getConnection();
												
												connection.query("INSERT INTO lol.user_history (Userid,logintime,matchmaking_status) values ('"+req.body.userid+"',now(),false)");
												connection.query("update lol.user_history set matchmaking_status=1 where userid='"+req.body.userid+"'");
												connection.query("SELECT userid as act_players FROM lol.user_history where matchmaking_status='1'", 
                                                function(err, rows) 
                                                {
                                                    if (err) throw err;
                                                    console.log(rows);
                                                    if(rows.length==3)
                                                    {
                                                       var users="('"+rows[0].act_players+"','"+rows[1].act_players+"','"+rows[2].act_players+"')";
                                                      // connection.query("update lol.user_history set matchmaking_status='1' where userid in "+users);
                                                       console.log("Ready for match making for users "+users);
                                                    }
                                                });
												connection.query("SELECT preferenceId,PREFERENCES.ROLEID,SCORE,ROLE_IMAGE,role_name FROM lol.PREFERENCES,lol.ROLES WHERE PREFERENCES.ROLEID=ROLES.ROLEID AND userid='"+req.body.userid+"' order by preferenceId asc",
																	function(err,rows)
																	{
																		var preferences=new Array();
																		//var scores=new Array();
																		var temp="";                              
																		var count=0;
																		for(var i=0;i<rows.length;)
																		{
																			var preference=new Array();
																			//var innerCount=0;
																			//var avgscore=0; 
																			temp=rows[i].preferenceId;                           
																			for(var j=i; i<rows.length && rows[i].preferenceId==temp;i++)
																			{
																				//innerCount++;
																				//avgscore=avgscore+rows[i].SCORE;                                    
																				preference[i-j]=rows[i];
																				//fs.writeFile('public/images/'+rows[i].role_name, rows[i].ROLE_IMAGE, 'binary');                                            
																			}
																			//avgscore=avgscore/innerCount;
																			//scores[count]=avgscore;                                      
																			preferences[count++]=preference;                                                                              
																		}                                    
																	res.render('MatchMaking', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid})
															});
											}
else{res.render('index', { title: 'Match Making Software',result:""});}});
app.post('/process',

					function(req, res, next) {
												var iterateCount=req.body.count;
												console.log("Count set to "+iterateCount);
												var connection = getConnection();
                                                
												if(req.body.win_status != null)
												{
													var win_status=req.body.win_status.split(" ");
													var winners="";
													for(var i=0;i<win_status.length;i++)
													{
														if(win_status[i] != '')
														{
															
															connection.query("SELECT userid FROM lol.preferences where preferenceId='"+win_status[i]+"'", 
															function(err, rows, fields) 
															{
																if (err) throw err;
																winners=winners+" "+rows[0].userid;
																//console.log(new Date());
																//console.log("Winners inside  ::::"+winners+" i::::"+i);
																connection.query("update lol.matchmaking set win_status='true' where userid='"+rows[0].userid+"' and matchmakingid='"+req.body.matchid+"'");
																connection.query("update lol.matchmaking set match_endtime=now() where matchmakingid='"+req.body.matchid+"'");
															});
														}
													}
													
													setTimeout(function(){//console.log("Winners::::"+winners);
													if(winners != ""){result="winners of the match are "+winners;}else{result="*There are no winners because players either didn't match on a preference or the game is left alone.";}
													if(iterateCount > 0)
													{
														iterateCount=iterateCount-1;
														connection.query("INSERT INTO lol.user_history (Userid,logintime,matchmaking_status) values ('"+req.body.userid+"',now(),false)");
														connection.query("update lol.user_history set matchmaking_status=1 where userid='"+req.body.userid+"'");
														connection.query("SELECT preferenceId,PREFERENCES.ROLEID,SCORE,ROLE_IMAGE,role_name FROM lol.PREFERENCES,lol.ROLES WHERE PREFERENCES.ROLEID=ROLES.ROLEID AND userid='"+req.body.userid+"' order by preferenceId asc",
																	function(err,rows)
																	{
																		var preferences=new Array();
																		var temp="";                              
																		var count=0;
																		for(var i=0;i<rows.length;)
																		{
																			var preference=new Array();
																			temp=rows[i].preferenceId;                           
																			for(var j=i; i<rows.length && rows[i].preferenceId==temp;i++)
																			{
																				preference[i-j]=rows[i];
																				//fs.writeFile('public/images/'+rows[i].role_name, rows[i].ROLE_IMAGE, 'binary');                                            
																			}
																			preferences[count++]=preference;                                   
																		}                                    
																	//res.render('MatchMaking', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid,count:iterateCount});
																	 connection.query("select roleid,role_image,role_name,description from lol.roles", 
																	 function(err, rows) 
																	 {
																		if (err) throw err;
																		console.log(rows);
																		/*var i;
																		for(i=0;i<rows.length;i++)
																		{
																			fs.writeFile('public/images/'+rows[i].role_name, rows[i].role_image, 'binary');
																		}*/
																		res.render('homescreen', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid,count:iterateCount,"images": rows});
																	 });
															});
													}
													else
													{
														res.render('playagain', { title: 'Match Making Software',result:result,userid:req.body.userid});
													}},100);
													
												}
											 }
		);
app.post('/making',
                    function(req,res,next){
                                                //create matchmaking entry here
                                                console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< In match making phase >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
                                                console.log("Here success :) "+req.body.userid+" , "+req.body.matchid);
                                                
                                                var connection = getConnection();
                                                
                                                //var dataInsert={matchmakingid:req.body.matchid,userid:req.body.userid,match_starttime:new Date(),match_endtime:0}
                                                //connection.query('INSERT INTO lol.MatchMaking SET ?', dataInsert);																
                                                connection.query("select roleid,role_image,role_name,description from lol.roles where roleid in (SELECT roleid from lol.individual_rolescores where userid='"+req.body.userid+"' and score=1)", 
                                                function(err, rows) 
                                                {
                                                    if (err) throw err;
                                                   // console.log(rows);
                                                    var i;
                                                    /*for(i=0;i<rows.length;i++)
                                                    {
                                                        fs.writeFile('public/images/'+rows[i].role_name, rows[i].role_image, 'binary');
                                                    }*/
													var images=rows;
                                                    connection.query("select roleid,role_image,role_name,description from lol.roles where roleid in (SELECT roleid from lol.individual_rolescores where userid='"+req.body.userid+"' and score=0)", 
													function(err, disableImages) 
													{
														if (err) throw err;
													   // console.log(rows);
														var i;
														/*for(i=0;i<disableImages.length;i++)
														{
															fs.writeFile('public/images/'+disableImages[i].role_name, disableImages[i].role_image, 'binary');
														}*/
													
																			connection.query("SELECT preferenceId,PREFERENCES.ROLEID,SCORE,ROLE_IMAGE,role_name FROM lol.PREFERENCES,lol.ROLES WHERE PREFERENCES.ROLEID=ROLES.ROLEID AND userid='"+req.body.userid+"' order by preferenceId asc",
																				function(err,rows)
																				{
																					//console.log(images);
																					var preferences=new Array();
																					//var scores=new Array();
																					var temp="";                              
																					var count=0;
																					for(var i=0;i<rows.length;)
																					{
																						var preference=new Array();
																						//var innerCount=0;
																						//var avgscore=0; 
																						temp=rows[i].preferenceId;                           
																						for(var j=i; i<rows.length && rows[i].preferenceId==temp;i++)
																						{
																							//innerCount++;
																							//avgscore=avgscore+rows[i].SCORE;                                    
																							preference[i-j]=rows[i];
																							//fs.writeFile('public/images/'+rows[i].role_name, rows[i].ROLE_IMAGE, 'binary');                                            
																						}
																						//avgscore=avgscore/innerCount;
																						//scores[count]=avgscore;                                      
																						preferences[count++]=preference;                                                                              
																					}                                    
																					//res.render('MatchMaking_process', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid,scores:scores,"images":images,matchid:req.body.matchid});
																					//console.log("SELECT userid from lol.MatchMaking where matchmakingid='"+req.body.matchid+"'");
																					//console.log(disableImages);
																					var iterateCount;
																					console.log("##############$$$@!#@!$#@$!@#!@$#@$@!#$@!@#$@!#$#!@##$!@$count==="+req.body.count);
																					if(req.body.count == "")
																					{
																						iterateCount=0;		//set count value here for repeation
																					}
																					else
																					{
																						iterateCount=req.body.count;
																					}
																					connection.query("SELECT userid from lol.MatchMaking where matchmakingid='"+req.body.matchid+"' && userid !='"+req.body.userid+"'",
																																	function(err,rows)
																																	{
																																		
																																								var othrplayer_preferences=new Array();
																																								var preference_count=0;
																																								var otherplayerroles_interested=new Array();
																																								var interest_count=0;
																																								for(var i=0,j=0;i<rows.length;i++)
																																									{
																																										console.log("select role_name from lol.roles where roleid in (SELECT roleid from lol.individual_rolescores where userid='"+rows[i].userid+"' and score=1)");
																																										connection.query("select role_name from lol.roles where roleid in (SELECT roleid from lol.individual_rolescores where userid='"+rows[i].userid+"' and score=1)", 
																																										function(err,intrested){
																																											var roles_interested=new Array();
																																											for(var k=0;k<intrested.length;k++)
																																											{
																																												console.log("#@$!#$!#1"+intrested[k]);
																																												roles_interested[k]=intrested[k];
																																											}
																																											otherplayerroles_interested[interest_count++]=roles_interested;
																																										});
																																										connection.query("SELECT preferenceId,PREFERENCES.ROLEID,SCORE,ROLE_IMAGE,role_name FROM lol.PREFERENCES,lol.ROLES WHERE PREFERENCES.ROLEID=ROLES.ROLEID AND userid='"+rows[i].userid+"' order by preferenceId asc",
																																										function(err,preference_rows)
																																										{
																																											var otherplayer_preference=new Array();
																																											var temp="";                              
																																											var count=0;	
																																											for(var i=0;i<preference_rows.length;)
																																											{
																																												var preference=new Array();
																																												temp=preference_rows[i].preferenceId;                           
																																												for(var j=i; i<preference_rows.length && preference_rows[i].preferenceId==temp;i++)
																																												{                                  
																																													preference[i-j]=preference_rows[i];
																																													//fs.writeFile('public/images/'+rows[i].role_name, rows[i].ROLE_IMAGE, 'binary');                                            
																																												}                                      
																																												otherplayer_preference[count++]=preference;                                                                              
																																											}                                   
																																											othrplayer_preferences[preference_count++]=otherplayer_preference;
																																											console.log("------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------");
																																											console.log(otherplayerroles_interested);
																																											console.log("------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------");
																																										}	);
																																									}
																																								
																																							setTimeout(function(){
																																								res.render('MatchMaking_process', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid,"images":images,matchid:req.body.matchid,"disabledImages":disableImages,count:iterateCount,otherplayer_preference:othrplayer_preferences,other_userid:rows,roles_interested:otherplayerroles_interested});
																																							},500);
																																	});
																																		
																					
																					//res.render('MatchMaking_process', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid,"images":images,matchid:req.body.matchid,"disabledImages":disableImages,count:iterateCount});                     
													});
												});
                                                });
                                           }
         );
app.post('/Login', function(req, res, next) {
    var result;
    var username=req.body.username;
    var password=req.body.password;
    var connection = getConnection();
    connection.query("SELECT userid FROM lol.login where userid='"+username+"' and password='"+password+"'", 
                        function(err, rows, fields) 
                        {
                            if (err) throw err;
                            if(rows.length==1 && rows[0].userid == username )
                            {
                                result="Login successfull";
                                connection.query("INSERT INTO lol.user_history (Userid,logintime,matchmaking_status) values ('"+username+"',now(),false)");
                                connection.query("SELECT preferenceId,PREFERENCES.ROLEID,SCORE,ROLE_IMAGE,role_name FROM lol.PREFERENCES,lol.ROLES WHERE PREFERENCES.ROLEID=ROLES.ROLEID AND userid='"+username+"' order by preferenceId asc",
                                function(err,rows)
                                {
                                    var preferences=new Array();
                                    var temp="";
                                    var count=0;
                                    for(var i=0;i<rows.length;)
                                    {
                                        var preference=new Array();
                                        temp=rows[i].preferenceId;                           
                                        for(var j=i; i<rows.length && rows[i].preferenceId==temp;i++)
                                        {
                                            preference[i-j]=rows[i];
                                        }
                                        preferences[count++]=preference;
                                    }
                                    io.emit('user',username);
                                    connection.query("select roleid,role_image,role_name,description from lol.roles", 
																	 function(err, rows) 
																	 {
																		if (err) throw err;
																		var i;
																		for(i=0;i<rows.length;i++)
																		{
																			fs.writeFile('public/images/'+rows[i].role_name, rows[i].role_image, 'binary');
																		}
																		res.render('homescreen', { title: 'Match Making Software',preferences:preferences,userid:username,"images": rows});
																	 }
													);
									
                                });
                                
                            }
                            else
                            {
                                result="Login failed :(";
                                console.log("Login Failed :(, rows::::: "+ rows.length);
                                res.render('index', { title: 'Match Making Software',result:result});
                            }
                        });
});



app.post('/register',
                        function(req,res,next)
                        {   
                            var fName=req.body.FirstName;
                            var lName=req.body.LastName;
                            var userId=req.body.Userid;
                            var confirmPass=req.body.confirmpass;
                            var password=req.body.password;
                      //      var error="";
                           //console.log("|||||||||||||||||||||||||||"+fName+","+lName+","+userId+","+confirmPass+","+password);
                            //var result="|||||||||||||||||||||||||||"+fName+","+lName+","+userId+","+confirmPass+","+password;
                            if (fName != "" && lName != "" && userId !="" && password != "")
                            {
                             if(confirmPass != password)
                             {
                                 res.render('index', { title: 'Match Making Software',result:"Passwords must match"});
                             }
                             else
                             {
                                 var dataInsert={firstName:fName,lastName:lName,userid:userId,password:password}
                                 
                                 var rn = require('random-number');
                                 var connection = getConnection();
                                 
                                 connection.query('INSERT INTO lol.login SET ?', dataInsert);
                                 connection.query("select roleid from lol.roles", 
                                        function(err, rows) 
                                        {
                                            if (err) {  console.log(err);res.render('index', { title: 'Match Making Software',result:err});}
                                            console.log(rows);
                                            var gen = rn.generator({
                                                            min:  1
                                                            , max: rows.length
                                                            , integer: true
                                                            });
                                            
                                            
                                            var scoreGen = rn.generator({
                                                min:  0
                                                            , max: 1
                                                            , integer: true
                                            });
											var checkPoint=false;
                                            for (var i = 0; i < rows.length; i++)
                                            {
												var scoreInt=scoreGen();
												if(scoreInt === 1){checkPoint=true;}
                                                var datainsert = { roleid: rows[i].roleid, userid: userId, score: scoreInt};
                                                connection.query('INSERT INTO lol.individual_rolescores SET ?', datainsert);
                                            }
											if(!checkPoint){
										console.log("Exceuting this point");		
										connection.query("update lol.individual_rolescores set score=1 where userid='"+userId+"' and roleid='"+rows[gen()-1].roleid+"'");
												}
												
												
										connection.query("SELECT IFNULL(MAX(PREFERENCEID),'P00000') as PREFID from lol.PREFERENCES",
                                                    function(err, currentrow) 
                                                    {
														
                                                        if (err) {  res.render('index', { title: 'Match Making Software',result:err});}
                                                        var prefid=currentrow[0].PREFID;
														connection.query("SELECT roleid from lol.individual_rolescores where score=1 and userid='"+userId+"'",
																function(err, row_interest) 
																			{
														var lastRole=new Array();
														var interestRole=new Array();
                                                        for(var i=1;i<=3;i++)
                                                        {
                                                            
                                                            //console.log("Current row value at this point "+i+"is::::"+currentrow);
                                                            
                                                            var temp="";
                                                            var pad=6-(""+(parseInt(prefid.substr(1,6))+1)).length;
                                                            for(var j=0;j<pad;j++)
                                                            {
                                                                temp+="0";
                                                            }
                                                            prefid='P'+temp+(parseInt(prefid.substr(1,6))+1);  
                                                    
                                                            var randomRoles=gen();
                                                            console.log("random roles:::::::"+randomRoles);
                                                            console.log("Preference Id::::::::"+prefid);
                                                            randomRoles=3;
															
																				for(var j=0;j<randomRoles;j++)
																				{
																					var dataInsert;
																					if(j == 0)
																					{
																						console.log(row_interest);
																						var interest_gen = rn.generator({
																										min:  0
																										, max: row_interest.length-1
																										, integer: true
																										});
																						console.log("inserting one role of interest");
																						interestRole[i]=row_interest[interest_gen()].roleid;
																						if (randomRoles == 1)
																						{
																							
																							dataInsert={preferenceid:prefid,roleId:interestRole[i],score:scoreGen(),userid:userId,composite:false};
																							
																						}
																						else
																						{	
																							dataInsert={preferenceid:prefid,roleId:interestRole[i],score:scoreGen(),userid:userId,composite:true};
																						}
																							connection.query('INSERT INTO lol.preferences SET ?', dataInsert);
																					}
																					else
																					{
																						var newRole=rows[gen()-1].roleid;
																						for(var t=1;t<i;t++)
																						{
																							if(newRole==lastRole[t] || newRole == interestRole[t])
																							{
																								newRole=rows[gen()-1].roleid;
																								t=1;
																							}
																						}
																		
																						if( j == randomRoles-1 )
																						{
																							lastRole[i]=newRole;
																						}
																						dataInsert={preferenceid:prefid,roleId:newRole,score:scoreGen(),userid:userId,composite:true};
																						connection.query('INSERT INTO lol.preferences SET ?', dataInsert);
																					}
																				}
														}
													});
                                                        });
                                            
                                });
                                res.render('index', { title: 'Match Making Software',result:"registeration successfull"});
                             }    
                            }
                            else
                            {
                                res.render('index', { title: 'Match Making Software',result:"All the fields are required*"});
                            }   
                            
                       });
                       
                       app.post('/match',function(req,res,next){
                                   var connection = getConnection();
                                   
                                   connection.query("update lol.user_history set matchmaking_status=1 where userid='"+req.body.userid+"'");
                                   connection.query("SELECT userid as act_players FROM lol.user_history where matchmaking_status='1'", 
                                                function(err, rows) 
                                                {
                                                    if (err) throw err;
                                                    console.log(rows);
                                                    if(rows.length==3)
                                                    {
                                                       var users="('"+rows[0].act_players+"','"+rows[1].act_players+"','"+rows[2].act_players+"')";
                                                      // connection.query("update lol.user_history set matchmaking_status='1' where userid in "+users);
                                                       console.log("Ready for match making for users "+users);
                                                    }
                                                });
                                   connection.query("SELECT preferenceId,PREFERENCES.ROLEID,SCORE,ROLE_IMAGE,role_name FROM lol.PREFERENCES,lol.ROLES WHERE PREFERENCES.ROLEID=ROLES.ROLEID AND userid='"+req.body.userid+"' order by preferenceId asc",
                                   function(err,rows)
                                   {
                                    var preferences=new Array();
                                    //var scores=new Array();
                                    var temp="";                              
                                    var count=0;
                                    for(var i=0;i<rows.length;)
                                    {
                                        var preference=new Array();
                                      // var innerCount=0;
                                        //var avgscore=0; 
                                        temp=rows[i].preferenceId;                           
                                        for(var j=i; i<rows.length && rows[i].preferenceId==temp;i++)
                                        {
                                            //innerCount++;
                                            //avgscore=avgscore+rows[i].SCORE;                                    
                                            preference[i-j]=rows[i];
                                            //fs.writeFile('public/images/'+rows[i].role_name, rows[i].ROLE_IMAGE, 'binary');                                            
                                        }
                                        //avgscore=avgscore/innerCount;
                                        //scores[count]=avgscore;                                      
                                        preferences[count++]=preference;                                                                              
                                    }                                    
                                    //res.render('MatchMaking', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid,scores:scores});                        
									res.render('MatchMaking', { title: 'Match Making Software',preferences:preferences,userid:req.body.userid,count:req.body.count});
                                });
                        });

                        /*app.get('/read',function(req, res, next) {
                            console.log("Hello");
                            var connection = getConnection();
                            
                            connection.query("select roleid,role_image,role_name,description from lol.roles", 
                                                function(err, rows) 
                                                {
                                                    if (err) throw err;
                                                    console.log(rows);
                                                    var i;
                                                    for(i=0;i<rows.length;i++)
                                                    {
                                                        fs.writeFile('public/images/'+rows[i].role_name, rows[i].role_image, 'binary');
                                                    }
                                                    res.render('image',{"images": rows});
                                                });
                        });*/
                        
                        module.exports = app;
