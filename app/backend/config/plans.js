// Plan configurations - shared between routes
const PLANS = {
    "Starter": { 
        name: "Starter", 
        price: 50000, 
        returnPercentage: 4.0,
        durationDays: 30
    },
    "Growth": { 
        name: "Growth", 
        price: 100000, 
        returnPercentage: 4.5,
        durationDays: 30
    },
    "Premium": { 
        name: "Premium", 
        price: 200000, 
        returnPercentage: 5.0,
        durationDays: 30
    }
};

module.exports = { PLANS };