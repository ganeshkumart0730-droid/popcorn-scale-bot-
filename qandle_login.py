import sys
import time
from DrissionPage import ChromiumPage, ChromiumOptions
toaster = None

# Configuration
URL = "https://nividous.qandle.com/#/login"
# ENTER YOUR CREDENTIALS HERE
EMAIL = "kumar.tg@nividous.com"
PASSWORD = "Ganesh@630"

def notify(title, message):
    if toaster:
        toaster.show_toast(title, message, duration=10, threaded=True)
    else:
        print(f"[{title}] {message}")

def run():
    print("Starting DrissionPage...")
    
    # Use local Chrome installation
    co = ChromiumOptions()
    page = ChromiumPage(co)
    
    print(f"Navigating to {URL}")
    page.get(URL)
    
    # Wait for page to load
    page.wait.load_start()
    time.sleep(3)
    
    # If credentials are provided, try to input them
    if EMAIL != "YOUR_USERNAME_HERE" and PASSWORD != "YOUR_PASSWORD_HERE":
        print("Entering credentials...")
        try:
            # Look for email input (typically the first text input or type=email)
            email_field = page.ele('tag:input@@type=email', timeout=1) or page.ele('tag:input', timeout=1)
            if email_field:
                email_field.clear()
                email_field.input(EMAIL)
            
            # Look for password input
            pw_field = page.ele('tag:input@@type=password', timeout=1)
            if pw_field:
                pw_field.clear()
                pw_field.input(PASSWORD)
                
            time.sleep(1)
        except Exception as e:
            print(f"Warning: Could not enter credentials: {e}")

    # Searching for login/sign up button...
    print("Searching for login button...")
    
    clicked = False
    
    # Strategy 1: Find button with type="submit"
    btn = page.ele('tag:button@@type=submit', timeout=1)
    if btn:
        print("Found submit button.")
        try:
            btn.click()
            clicked = True
        except Exception as e:
            print(f"Failed to click submit button: {e}")
            
    # Strategy 2: Find button with exact text or class
    if not clicked:
        buttons = ["SIGN IN", "Sign in", "Login", "Sign In", "Log In", "Sign up"]
        for btn_text in buttons:
            ele = page.ele(f'tag:button@@text():{btn_text}', timeout=1)
            if ele:
                print(f"Found button tag with text: {btn_text}")
                try:
                    ele.click()
                    clicked = True
                    break
                except Exception as e:
                    pass
    
    # Strategy 3: Click any element containing 'SIGN IN' that is NOT a header
    if not clicked:
        elements = page.eles('text:SIGN IN')
        for el in elements:
            if el.tag not in ['h1', 'h2', 'h3', 'h4', 'span']:
                try:
                    print(f"Clicking element with tag: {el.tag}")
                    el.click()
                    clicked = True
                    break
                except:
                    pass

    # Strategy 4: Just click the first <button> after the password field
    if not clicked:
        b = page.ele('tag:button', timeout=1)
        if b:
            try:
                print("Clicking first button element.")
                b.click()
                clicked = True
            except:
                pass
                
    if not clicked:
        print("Warning: Could not automatically find a sign in/sign up button to click. You might already be logged in.")
        
    print("Waiting for dashboard to load...")
    # Wait for the URL to change to dashboard, or wait a few seconds
    page.wait.url_change("dashboard", timeout=30)
    
    # If the URL now has dashboard, it was successful
    if "dashboard" in page.url.lower():
        notify("Qandle Login", "Successfully logged into Qandle!")
        print("Dashboard loaded successfully.")
    else:
        print(f"Current URL is {page.url}, assuming logged in successfully or wait failed.")
        notify("Qandle Login", f"Finished executing script. Final URL: {page.url}")
        
    print("Clicking on Overview...")
    try:
        overview_btn = page.ele('text:Overview', timeout=10)
        if overview_btn:
            overview_btn.click()
            print("Clicked Overview successfully.")
            
            # Now wait a moment for the section to load and click Clock In
            time.sleep(3)
            print("Searching for Clock In button...")
            clock_in_btn = page.ele('text:Clock In', timeout=10)
            if clock_in_btn:
                clock_in_btn.click()
                print("Clicked Clock In successfully!")
            else:
                print("Warning: Could not find the Clock In button.")
    except Exception as e:
        print(f"Failed to click Overview or Clock In: {e}")
        
    time.sleep(3)
    # We will not close the browser here so the user can see it! 

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"Error: {e}")
        notify("Qandle Script Error", f"An unexpected error occurred: {e}")
