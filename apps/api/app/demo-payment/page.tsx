import "./demo.css";

export default function DemoPaymentPage() {
  return (
    <main className="demo-page">
      <div id="success-container" className="demo-card success-card" style={{ display: "none" }}>
        <div className="success-icon">✓</div>
        <h2>Payment Successful!</h2>
        <p>The money has been added to the wallet.</p>
        <p className="subtext">You can now check the Admin Portal or the Resident App to see the updated balance.</p>
      </div>

      <div id="form-container" className="demo-card">
        <div className="demo-header">
          <h1>Society EV</h1>
          <span className="badge">DEMO GATEWAY</span>
        </div>
        
        <p className="description">
          Enter the amount you wish to recharge. This is a mock payment gateway for presentation purposes.
        </p>

        <div className="input-group">
          <label>Amount (₹)</label>
          <input 
            id="amount-input"
            type="number" 
            defaultValue="1000" 
            placeholder="e.g. 500"
          />
        </div>

        <div className="preset-amounts">
          <button type="button" className="preset-btn" onclick="document.getElementById('amount-input').value = '500'; updateBtnText()">₹500</button>
          <button type="button" className="preset-btn" onclick="document.getElementById('amount-input').value = '1000'; updateBtnText()">₹1000</button>
          <button type="button" className="preset-btn" onclick="document.getElementById('amount-input').value = '2000'; updateBtnText()">₹2000</button>
        </div>

        <a 
          id="native-pay-btn"
          href="javascript:void(0)" 
          className="pay-button" 
          style={{ display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}
        >
          Pay ₹1000
        </a>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
          function updateBtnText() {
            var amt = document.getElementById('amount-input').value;
            var btn = document.getElementById('native-pay-btn');
            if (btn && btn.innerText !== "Processing...") {
              btn.innerText = "Pay ₹" + (amt || 0);
            }
          }

          document.getElementById('amount-input').addEventListener('input', updateBtnText);

          document.getElementById('native-pay-btn').onclick = async function(e) {
            e.preventDefault();
            var btn = document.getElementById('native-pay-btn');
            if (btn.innerText === "Processing...") return;

            var amount = document.getElementById('amount-input').value;
            var params = new URLSearchParams(window.location.search);
            var userId = params.get('userId');
            
            if (!userId) {
              alert('Missing Resident ID! Please ensure the URL contains ?userId=...');
              return;
            }

            if (Number(amount) <= 0 || isNaN(Number(amount))) {
              alert('Please enter a valid amount.');
              return;
            }

            btn.innerText = "Processing...";
            btn.style.opacity = "0.7";
            btn.style.cursor = "not-allowed";
            
            try {
              var res = await fetch('/api/v1/wallet/public-demo-recharge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: Number(amount), userId: userId })
              });
              
              if (!res.ok) {
                var data = await res.json();
                alert('Payment Failed: ' + (data.error ? data.error.message : 'Unknown error'));
                btn.innerText = "Pay ₹" + amount;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
                return;
              }

              document.getElementById('form-container').style.display = 'none';
              document.getElementById('success-container').style.display = 'block';
            } catch (err) {
              alert('Network Error: ' + err.message);
              btn.innerText = "Pay ₹" + amount;
              btn.style.opacity = "1";
              btn.style.cursor = "pointer";
            }
          };
        `
      }} />
    </main>
  );
}
