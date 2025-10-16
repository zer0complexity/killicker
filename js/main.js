// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add a simple welcome message to the console
    console.log('Website loaded successfully!');

    // Get the current year for the footer
    const footer = document.querySelector('footer p');
    const currentYear = new Date().getFullYear();
    footer.innerHTML = `&copy; ${currentYear} My Website. All rights reserved.`;
});