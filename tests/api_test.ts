import dotenv from "dotenv";
dotenv.config();

async function testEndpoints() {
  console.log("🔍 Running API Tests...");
  const baseUrl = "http://localhost:3000";

  const endpoints = ["/api/emissions", "/api/monthly-averages"];

  for (const endpoint of endpoints) {
    console.log(`\nTesting ${endpoint}...`);
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      const data = await response.json();

      if (response.ok) {
        console.log(`✅ ${endpoint} returned 200 OK`);
        if (endpoint === "/api/emissions") {
          if (Array.isArray(data.data) && data.data.length > 0) {
            console.log(`   Found ${data.data.length} data points.`);
          } else {
            console.error(`   ❌ Error: ${endpoint} returned empty or invalid data array.`);
            process.exit(1);
          }
        }
      } else {
        console.error(`❌ ${endpoint} returned ${response.status}: ${JSON.stringify(data)}`);
        if (data.error && data.error.includes("WATTTIME_USER")) {
          console.log("   (Expected error if credentials are missing)");
        } else {
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to fetch ${endpoint}:`, error);
      process.exit(1);
    }
  }

  console.log("\n✨ All tests completed successfully!");
}

testEndpoints();
