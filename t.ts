abstract class A {
  static tag = "A";
    getName(){
        return 'a'
    };

  info() {
    return A.tag + " " + this.getName();
  }
}

class B extends A {
  getName() {
    return "b";
  }
}

console.log(new B().info());
