require('dotenv').config();
const express = require('express');
const path = require('path');

const indexRoutes = require('./routes/index');
const playerRoutes = require('./routes/player');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', indexRoutes);
app.use('/player', playerRoutes);
app.use('/admin', adminRoutes);

app.listen(PORT, () => {
    console.log(`LV Battle League running on port ${PORT}`);
});
