interface ApiResponse {
    status: string;
    text: string;
    message: string;
    data?: any;
}

interface Balance {
    RUB: number;
    USD: number;
}

interface Transaction {
    id: number;
    fromUid: number;
    toUid: number;
    currency: 'RUB' | 'USD';
    amount: number;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    timestamp: string;
}

class User {
    public uid: number;
    public login: string;
    public password: string;
    public phone: string;
    public age: string;
    public verification: boolean = false;
    public online: boolean = false;
    public cardNumber?: string;
    public geo?: string;
    public balance: Balance = { RUB: 10000, USD: 100 };
    public transactionHistory: Transaction[] = [];

    private static nextTransactionId: number = 1;

    constructor(uid: number, login: string, password: string, phone: string = "", age: string = "") {
        this.uid = uid;
        this.login = login;
        this.age = age;
        this.password = password;
        this.phone = phone;
    }

    signIn(login: string, password: string): ApiResponse {
        if (this.login === login && this.password === password) {
            this.online = true;
            return { status: "200", text: "OK", message: "Авторизация успешна" };
        }
        return { status: "401", text: "Unauthorized", message: "Неверные данные учетной  записи" };
    }

    static users: User[] = [];
    static nextUid: number = 1;

    static signUp(login: string, password: string, passwordRepeat: string): ApiResponse {
        if (login.length < 3 || login.length > 20) {
            return { status: "400", text: "Bad Request", message: "Логин должен быть от 3 до 20 символов" };
        }
        if (password.length < 6) {
            return { status: "400", text: "Bad Request", message: "Пароль должен быть не короче 6 символов" };
        }
        if (password !== passwordRepeat) {
            return { status: "400", text: "Bad Request", message: "Пароли не совпадают" };
        }
        if (User.users.some(user => user.login === login)) {
            return { status: "409", text: "Conflict", message: "Логин уже существует" };
        }
        const loginRegex = /^[a-zA-Z0-9]+$/;
        if (!loginRegex.test(login)) {
            return { status: "400", text: "Bad Request", message: "Логин содержит недопустимые символы. Разрешены только буквенно-цифровые символы" };
        }

        const newUser = new User(User.nextUid++, login, password);
        User.users.push(newUser);
        return newUser.signIn(login, password);
    }

    static verify(login: string, phone: string, age: string, cardNumber?: string, geo?: string): ApiResponse {
        const foundUser = User.users.find(u => u.login === login);
        if (!foundUser) {
            return { status: "404", text: "Not Found", message: "Пользователь не найден" };
        }

        foundUser.phone = phone;
        foundUser.age = age;
        foundUser.cardNumber = cardNumber;
        foundUser.geo = geo;
        foundUser.verification = true;

        return { status: "200", text: "OK", message: "Верификация успешна" };
    }

    static forgetPwd(login: string, phone: string, newPassword: string): ApiResponse {
        const user = User.users.find(u => u.login === login);
        if (!user) {
            return { status: "404", text: "Not Found", message: "Пользователь не найден" };
        }
        if (user.phone !== phone) {
            return { status: "401", text: "Unauthorized", message: "Телефон не совпадает" };
        }
        if (newPassword.length < 6) {
            return { status: "400", text: "Bad Request", message: "Пароль должен быть не короче 6 символов" };
        }

        user.password = newPassword;
        return { status: "200", text: "OK", message: "Пароль успешно изменен" };
    }

    static transactionTrigger(fromUid: number, toUid: number, currency: 'RUB' | 'USD', amount: number): ApiResponse {
        const fromUser = User.users.find(u => u.uid === fromUid);
        const toUser = User.users.find(u => u.uid === toUid);

        if (!fromUser || !toUser) {
            return { status: "404", text: "Not Found", message: "Один из пользователей не найден" };
        }
        if (fromUser.uid === toUser.uid) {
            return { status: "400", text: "Bad Request", message: "Нельзя отправить транзакцию самому себе" };
        }
        if (amount <= 0) {
            return { status: "400", text: "Bad Request", message: "Сумма должна быть положительной" };
        }
        if (fromUser.balance[currency] < amount) {
            return { status: "400", text: "Bad Request", message: "Недостаточно средств для отправки" };
        }

        const transaction: Transaction = {
            id: User.nextTransactionId++,
            fromUid,
            toUid,
            currency,
            amount,
            status: 'PENDING',
            timestamp: new Date().toISOString()
        };

        fromUser.transactionHistory.push(transaction);
        toUser.transactionHistory.push(transaction);

        return { status: "200", text: "OK", message: "Предложение транзакции отправлено" };
    }

    static transactionReceive(transactionId: number, receiverUid: number, accept: boolean): ApiResponse {
        const receiver = User.users.find(u => u.uid === receiverUid);
        if (!receiver) {
            return { status: "404", text: "Not Found", message: "Получатель не найден" };
        }

        const transaction = receiver.transactionHistory.find(t => t.id === transactionId && t.toUid === receiverUid && t.status === 'PENDING');
        if (!transaction) {
            return { status: "404", text: "Not Found", message: "Транзакция не найдена или уже обработана" };
        }

        const sender = User.users.find(u => u.uid === transaction.fromUid);
        if (!sender) {
            return { status: "404", text: "Not Found", message: "Отправитель не найден" };
        }

        if (!accept) {
            transaction.status = 'REJECTED';
            const senderTransaction = sender.transactionHistory.find(t => t.id === transactionId);
            if (senderTransaction) senderTransaction.status = 'REJECTED';
            return { status: "200", text: "OK", message: "Транзакция отклонена" };
        }

        const exchangeRate = { USD: 100, RUB: 0.01 };
        const requiredAmount = transaction.currency === 'USD' ? transaction.amount * exchangeRate.USD : transaction.amount;
        const receiverCurrency = transaction.currency === 'USD' ? 'RUB' : 'USD';

        if (receiver.balance[receiverCurrency] < requiredAmount) {
            transaction.status = 'REJECTED';
            const senderTransaction = sender.transactionHistory.find(t => t.id === transactionId);
            if (senderTransaction) senderTransaction.status = 'REJECTED';
            return { status: "400", text: "Bad Request", message: "Недостаточно средств" };
        }

        sender.balance[transaction.currency] -= transaction.amount;
        receiver.balance[receiverCurrency] -= requiredAmount;
        receiver.balance[transaction.currency] += transaction.amount;
        sender.balance[receiverCurrency] += requiredAmount;

        transaction.status = 'ACCEPTED';
        const senderTransaction = sender.transactionHistory.find(t => t.id === transactionId);
        if (senderTransaction) senderTransaction.status = 'ACCEPTED';

        return { status: "200", text: "ок", message: "Транзакция прошла успешно" };
    }

    static getUserInfo(uid: number): ApiResponse {
        const user = User.users.find(u => u.uid === uid);
        if (!user) {
            return { status: "404", text: "Not Found", message: "Пользователь не найден" };
        }

        return {
            status: "200",
            text: "OK",
            message: "Информация о пользователе получена",
            data: {
                uid: user.uid,
                login: user.login,
                online: user.online,
                verification: user.verification,
                balance: user.balance,
                transactionCount: user.transactionHistory.length
            }
        };
    }
}


console.log(User.signUp("TestUser", "SecurePass1", "SecurePass1"));
console.log(User.signUp("TestUser2", "SecurePass2", "SecurePass2")); 
console.log(User.signUp("TestUser", "SecurePass1", "SecurePass1"));
console.log(User.signUp("Short", "123", "123"));
console.log(User.signUp("Invalid!Login", "SecurePass", "SecurePass"));
console.log(User.signUp("AnotherUser", "P@$$wOrd", "P@sswOrd"));
console.log(User.verify("TestUser", "7-(111)-111-11-11", "19", "1234-5678-9012-3456", "Moskow"));
console.log(User.forgetPwd("TestUser", "7-(111)-111-11-11", "12345d"));
let ivan = User.users[0];
console.log(ivan.signIn("TestUser", "SecurePass1"));


console.log(User.transactionTrigger(1, 2, "USD", 50)); 
console.log(User.transactionReceive(1, 2, true)); 
console.log(User.getUserInfo(2));
