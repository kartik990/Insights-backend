import nodemailer from "nodemailer";

const sendEmail = async (to: string, html: string) => {
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.log(testAccount);

    const transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const info = await transporter.sendMail({
      from: '"Dev. Test" <foo@example.com>', // sender address
      to, // "bar@example.com, baz@example.com", // list of receivers
      subject: "Reset Password", // Subject line
      html,
    });

    console.log("Message successfully sent: %s", info.messageId);
    console.log("Link to view mail", nodemailer.getTestMessageUrl(info));
  } catch (err) {
    console.log(err);
  }
};

export { sendEmail };
