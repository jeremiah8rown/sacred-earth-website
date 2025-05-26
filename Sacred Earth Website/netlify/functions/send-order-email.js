// netlify/functions/send-order-email.js
import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

// This is a good place for an early check, though the handler should also check.
if (!resendApiKey) {
    console.error("CRITICAL SETUP ERROR: Resend API Key is not defined in environment variables at function initialization.");
}
const resend = new Resend(resendApiKey);

// These are the email addresses your function will use.
const yourReceivingEmail = "orders@sacredearthproduce.com"; // Confirmed by you
const fromEmailAddress = "orders@sacredearthproduce.com";   // Confirmed by you (must be from your Resend verified domain)
const fromName = "Sacred Earth Produce";                   // Confirmed by you

export async function handler(event, context) {
    // Check API key availability at the start of every function execution
    if (!resendApiKey) {
        console.error("Resend API Key is not available at invocation time.");
        return { 
            statusCode: 500, 
            body: JSON.stringify({ 
                success: false, 
                message: "Email service configuration error. Please contact administrator." 
            }) 
        };
    }

    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ success: false, message: 'Method Not Allowed. This function only accepts POST requests.' }) 
        };
    }

    try {
        const orderData = JSON.parse(event.body);

        // Validate essential incoming data from your webpage
        if (!orderData.businessName || !orderData.items || typeof orderData.items !== 'object' || Object.keys(orderData.items).length === 0) {
            console.warn("Incomplete order data received:", orderData);
            return { 
                statusCode: 400, 
                body: JSON.stringify({ success: false, message: "Incomplete order: Business Name and items are required." }) 
            };
        }

        const subject = `Order Request - ${orderData.businessName} - ${orderData.availabilityDate || 'Current List'}`;

        // Construct HTML Email Body
        let htmlBody = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; border: 1px solid #dddddd; padding: 20px;">
                <h2 style="color: #3f6134; text-align: center;">New Order Request</h2>
                <p style="text-align: center; font-size: 0.9em; color: #555;"><em>from Sacred Earth Produce Availability List</em></p>
                <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                <p><strong>Business Name:</strong> ${orderData.businessName}</p>
                ${orderData.buyerEmail ? `<p><strong>Buyer's Email (for CC):</strong> ${orderData.buyerEmail}</p>` : ''}
                <p><strong>List Date Referenced:</strong> ${orderData.availabilityDate || "N/A"}</p>
                <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                <h3 style="color: #3f6134; border-bottom: 1px solid #eeeeee; padding-bottom: 5px;">Order Details:</h3>
                <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 10pt; border: 1px solid #dddddd;">
                    <thead style="background-color: #3f6134; color: white;">
                        <tr>
                            <th style="padding: 8px; text-align:left; border-right: 1px solid #557758;">Qty</th>
                            <th style="padding: 8px; text-align:left; border-right: 1px solid #557758;">Item</th>
                            <th style="padding: 8px; text-align:left;">Pack</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let rowCounter = 0;
        for (const itemId in orderData.items) {
            const item = orderData.items[itemId];
            if (item.quantity > 0) {
                const itemName = item.name || "N/A";
                const itemPack = item.pack || "N/A";
                const itemQuantity = item.quantity || 0;
                const rowBgColor = rowCounter % 2 === 0 ? '#ffffff' : '#f7fbf5;';
                htmlBody += `
                    <tr style="background-color: ${rowBgColor};">
                        <td style="padding: 8px; border-bottom: 1px solid #dddddd; text-align: center;">${itemQuantity}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #dddddd;"><strong>${itemName}</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #dddddd;">${itemPack}</td>
                    </tr>
                `;
                rowCounter++;
            }
        }
        htmlBody += `</tbody></table>`;

        if (orderData.notes && orderData.notes.trim() !== "") {
            htmlBody += `
                <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                <h3 style="color: #3f6134;">Notes from Buyer:</h3>
                <p style="white-space: pre-wrap; background-color: #f8faf6; padding: 10px; border-radius: 4px; border: 1px solid #dddddd;">${orderData.notes.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            `;
        }
        htmlBody += `<hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;"><p style="text-align: center; font-size: 0.9em; color: #555;">Thank you!</p></div>`;
        
        const mailOptions = {
            from: `${fromName} <${fromEmailAddress}>`,
            to: [yourReceivingEmail],
            subject: subject,
            html: htmlBody,
            // text: textBody, // You can generate a plain text version too for better deliverability
        };

        if (orderData.buyerEmail) {
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderData.buyerEmail)) { 
                mailOptions.cc = [orderData.buyerEmail];
            } else {
                console.warn("Invalid CC email format provided by buyer, not CC'ing:", orderData.buyerEmail);
            }
        }

        console.log("Attempting to send email via Resend. From:", fromEmailAddress, "To:", yourReceivingEmail);
        const { data, error } = await resend.emails.send(mailOptions);

        if (error) {
            console.error("Resend API Error Details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return { 
                statusCode: error.statusCode || 500, 
                body: JSON.stringify({ success: false, message: `Email sending failed: ${error.name} - ${error.message}. Please check server logs.` }) 
            };
        }

        console.log("Resend success. Email ID:", data.id);
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Order request sent successfully!', resend_id: data.id }),
        };

    } catch (error) { 
        console.error("Serverless Function General Catch Error:", error.message, error.stack);
        return {
            statusCode: 500, 
            body: JSON.stringify({ success: false, message: "An unexpected error occurred while processing your request.", error: error.toString() }),
        };
    }
}