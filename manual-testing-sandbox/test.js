class Calculator {
  constructor() {
    this.result = 0;
  }

  add(number) {
    this.result += number;
    return this;
  }
  subtract(number) {
    this.result -= number;
    return this;
  }

  multiply(number) {
    this.result *= number;
    return this;
  }

  divide(number) {
    if (number === 0) {
      throw new Error("Cannot divide by zero");
    }
    this.result /= number;
    return this;
  }

  factorial() {
    if (this.result < 0) {
      throw new Error("Factorial is not defined for negative numbers");
    }
    if (this.result !== Math.floor(this.result)) {
      throw new Error("Factorial is only defined for integers");
    }

    let result = 1;
    for (let i = 2; i <= this.result; i++) {
      result *= i;
    }
    this.result = result;
    return this;
  }

  getResult() {
    return this.result;
  }

  reset() {
    this.result = 0;
    return this;
  }
}
